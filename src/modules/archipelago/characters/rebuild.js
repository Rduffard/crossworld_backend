const {createHash}=require('node:crypto');
const rules=require('../system/rules2024');
function fail(message,statusCode=422){throw Object.assign(new Error(message),{statusCode});}
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function fingerprint(c){const runtime=structuredClone(c.rulesRuntime);delete runtime.rebuildProposal;delete runtime.revision;return hash({ledger:c.rulesLedger,runtime,inventory:c.inventory,loadout:c.loadout,presets:c.presets,goldCp:c.goldCp});}
function fields(p,allowed){if(Object.keys(p).some(k=>!allowed.includes(k)))fail('Invalid rebuild fields');}
function available(c){if(c.rulesRuntime.inCombat||c.rulesRuntime.ownerTurn?.open||c.rulesRuntime.restSession)fail('Finish combat, the open turn and any active rest before rebuilding');}
function plan(c,after,ledger=c.rulesLedger){
  const before=rules.replay(c.rulesLedger),old=c.rulesRuntime,next=rules.runtime.initialize(after);
  next.revision=old.revision+1;next.health.current=Math.min(old.health.current,after.health.max);
  for(const key of ['gearUses','prayerRestEpoch','magicDawns','lastMagicDawn','conditions','exhaustion','deathSaves','inspiration','inspirationSource','worldTime','lastLongRest','restEpoch','restHistory','milestones','conduitCircuit','conduitGrants','spellDiscoveries','toolChecks','ownerTurnHistory','counters'])if(old[key]!==undefined)next[key]=structuredClone(old[key]);
  for(const [id,max]of Object.entries(after.resources))next.pools[id]=before.resources[id]?Math.max(0,Math.min(old.pools[id],max.max-(before.resources[id].max-old.pools[id]))):0;
  next.slots=after.spellSlots.map((max,i)=>Math.max(0,Math.min(old.slots[i]??0,max-((before.spellSlots[i]??0)-(old.slots[i]??0)))));
  for(const [die,max]of Object.entries(after.hitDice))next.hitDice[die]=Math.max(0,Math.min(old.hitDice[die]??0,max-((before.hitDice[die]??0)-(old.hitDice[die]??0))));
  const newCharacter={...c,rulesLedger:ledger};
  next.featState=Object.fromEntries(Object.values(old.featState??{}).filter(record=>after.feats.includes(record.featId)).map(record=>[require('../system/rules2024/featOperations').source(newCharacter,record.featId),structuredClone(record)]));
  if(after.spellcasting.shipwright){for(const key of ['folio','folioUnavailable','folioMemory','folioBookId','folioHistory'])if(old[key]!==undefined)next[key]=structuredClone(old[key]);next.folio=(next.folio??[]).filter(id=>!after.spellcasting.shipwright.folio.includes(id));next.folioMemory=(next.folioMemory??[]).filter(id=>next.preparations.shipwright.includes(id)||after.spellcasting.shipwright.alwaysPrepared.includes(id));}
  if(after.callingLevels.doctor===20&&old.interventionCooldown)next.interventionCooldown=structuredClone(old.interventionCooldown);
  // Rebuild is a rules change, never a rest or a new equipment package.
  rules.runtime.validate(after,next);
  const inventory=structuredClone(c.inventory),endedAttunementIds=[];
  for(const item of inventory)if(item.attuned&&!require('../equipment/magic').eligible(item,after)){item.attuned=false;endedAttunementIds.push(item.instanceId);}
  require('../equipment/magic').validate({...c,inventory},after);
  return {runtime:next,inventory,consequences:{health:{before:old.health.current,after:next.health.current,max:after.health.max},pools:next.pools,slots:next.slots,hitDice:next.hitDice,endedEffectIds:old.effects.map(e=>e.id??e.featureId),temporaryHealthLost:old.temporaryHealth??0,createdSlotsLost:old.createdSlots??[],endedAttunementIds,inventoryUnchanged:!endedAttunementIds.length,copperUnchanged:true,newPoolsStartEmpty:true}};
}
function apply(c,type,p,access={}){
  available(c);
  if(type==='rebuild.preview'){
    fields(p,['ledger','reason']);if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)fail('Provide a rebuild reason');
    const ledger=structuredClone(p.ledger);if(!ledger?.creation)fail('Complete the origin, background and point-buy rebuild');
    if(Array.isArray(ledger.levels))for(const [index,event] of ledger.levels.entries()){
      if(event?.folioAtSpellGrant===undefined)continue;
      const saved=c.rulesLedger.levels[index];
      const choice=index===17?'spellMastery':'signatureSpells';
      if(JSON.stringify(event.folioAtSpellGrant)!==JSON.stringify(saved?.folioAtSpellGrant)||
        JSON.stringify(event.choices?.[choice])!==JSON.stringify(saved?.choices?.[choice]))fail('Cannot change a historical spell grant backed by a saved folio');
    }
    ledger.revision=c.rulesLedger.revision+1;const summary=rules.replay(ledger);
    if(ledger.levels.length>c.rulesLedger.levels.length)fail('A rebuild cannot grant additional levels');
    delete c.rulesRuntime.rebuildProposal;
    if(!summary.decisionsComplete||ledger.levels.length!==c.rulesLedger.levels.length)return {type,draftLedger:ledger,summary,complete:false,targetLevel:c.rulesLedger.levels.length};
    const {consequences}=plan(c,summary,ledger),baseHash=fingerprint(c),proposalId=hash({ledger,reason:p.reason.trim(),baseHash});
    c.rulesRuntime.rebuildProposal={proposalId,ledger,reason:p.reason.trim(),baseHash,consequences,approvedBy:null};c.rulesRuntime.revision++;
    return {type,draftLedger:ledger,summary,complete:true,proposalId,consequences};
  }
  fields(p,type==='rebuild.approve'?['proposalId']:['proposalId','acceptConsequences']);
  const proposal=c.rulesRuntime.rebuildProposal;
  if(!proposal||p.proposalId!==proposal.proposalId)fail('Preview the complete matching rebuild proposal first',409);
  if(fingerprint(c)!==proposal.baseHash)fail('Character changed after the rebuild preview; preview it again',409);
  if(type==='rebuild.approve'){
    if(!access.gmAllowed&&c.campaignId)fail('Only the registered campaign GM can approve this rebuild',403);
    proposal.approvedBy=access.userId??String(c.owner??'solo-owner');c.rulesRuntime.revision++;
    return {type,proposalId:proposal.proposalId,approvedBy:proposal.approvedBy};
  }
  if(type!=='rebuild.commit')fail('Unknown rebuild operation');
  if(c.campaignId&&!proposal.approvedBy)fail('The campaign GM must approve this exact rebuild proposal',403);
  if(p.acceptConsequences!==true)fail('Accept the previewed resource consequences before committing');
  const summary=rules.replay(proposal.ledger);if(!summary.decisionsComplete||summary.totalLevel!==c.rulesLedger.levels.length)fail('A rebuild must contain complete choices at the existing level');
  const {runtime,inventory,consequences}=plan(c,summary,proposal.ledger);c.rulesRuntime=runtime;c.inventory=inventory;c.rulesLedger=proposal.ledger;c.attributes=summary.attributes;c.origin=summary.originId;c.calling=proposal.ledger.levels[0].callingId;
  return {type,proposalId:proposal.proposalId,approvedBy:proposal.approvedBy??access.userId??String(c.owner??'solo-owner'),reason:proposal.reason,consequences};
}
module.exports={apply,plan};
