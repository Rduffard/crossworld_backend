const {createHash}=require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { reconcileHealthOnRebuild } = require('@crossworld/sanguine-engine/progression');
const { wishInterventionUnlocked } = require('@crossworld/sanguine-engine/callings');
const rules=require('../system/characterSystem');
const { reconcileBalances, reconcileDice } = require('./runtime/resourceTransitions');
const { reconcileSlotTotals } = require('../spells/spellSlotState');
function fail(message,statusCode=422){throw Object.assign(new Error(message),{statusCode});}
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function fingerprint(c){const runtime=structuredClone(c.rulesRuntime);delete runtime.rebuildProposal;delete runtime.revision;return hash({ledger:c.rulesLedger,runtime,inventory:c.inventory,loadout:c.loadout,presets:c.presets,goldCp:c.goldCp});}
function fields(p,allowed){if(Object.keys(p).some(k=>!allowed.includes(k)))fail('Invalid rebuild fields');}
function available(c){if(c.rulesRuntime.inCombat||c.rulesRuntime.ownerTurn?.open||c.rulesRuntime.restSession)fail('Finish combat, the open turn and any active rest before rebuilding');}

function validateStartingTraining(ledger, saved) {
  if (ledger.version !== 4) return false;
  return saved.version !== 4 || ledger.creation?.backgroundId !== saved.creation?.backgroundId ||
    !isDeepStrictEqual(ledger.creation?.custom?.skills, saved.creation?.custom?.skills) ||
    ledger.levels?.[0]?.callingId !== saved.levels[0].callingId ||
    !isDeepStrictEqual(ledger.levels?.[0]?.choices?.skills, saved.levels[0].choices?.skills);
}

function replaySavedChoices(ledger, saved) {
  const options = { validateStartingTraining: validateStartingTraining(ledger, saved) };
  while (true) {
    try {
      return rules.replay(ledger, options);
    } catch (error) {
      const { index, key } = error.savedChoice ?? {};
      const event = ledger.levels?.[index];
      const previous = saved.levels[index];
      if (!event?.choices || !previous?.choices || event.callingId !== previous.callingId ||
        !Object.hasOwn(event.choices, key) || !isDeepStrictEqual(event.choices[key], previous.choices[key])) throw error;
      // These choices are being revalidated because an earlier decision changed.
      // Never discard a new value the player explicitly supplied.
      delete event.choices[key];
      if (key === 'increases' && isDeepStrictEqual(event.choices.feat, previous.choices.feat))
        delete event.choices.feat;
      if (key === 'feat' && isDeepStrictEqual(event.choices.increases, previous.choices.increases))
        delete event.choices.increases;
    }
  }
}

function retainPersonalLevels(ledger, saved, targetLevel, summary) {
  const keepsFormHistory = ledger.creation.lineage?.id === saved.creation.lineage?.id;
  while (summary.decisionsComplete && ledger.levels.length < targetLevel) {
    const index = ledger.levels.length;
    const event = structuredClone(saved.levels[index]);
    if (event.callingId !== ledger.levels[0].callingId) break;
    if (!keepsFormHistory) delete event.lineageForm;
    ledger.levels.push(event);
    try {
      try {
        summary = replaySavedChoices(ledger, saved);
      } catch (error) {
        if (!event.lineageForm || !error.fieldPath?.startsWith('lineageForm.')) throw error;
        if (error.fieldPath.startsWith('lineageForm.replaceForm.')) delete event.lineageForm.replaceForm;
        else delete event.lineageForm;
        summary = replaySavedChoices(ledger, saved);
      }
    } catch (error) {
      if (![400, 422].includes(error.statusCode)) throw error;
      // Keep the validated prefix. Let the player reopen this level's choices.
      ledger.levels.pop();
      break;
    }
  }
  return summary;
}

function plan(c,after,ledger=c.rulesLedger){
  const before=rules.replay(c.rulesLedger),old=c.rulesRuntime,next=rules.runtime.initialize(after);
  require('./runtime/animalHealth').reconcile(before,old,after,next);
  next.revision=old.revision+1;next.health.current=reconcileHealthOnRebuild(old.health.current,after.health.max);
  for(const key of ['gearUses','prayerRestEpoch','magicDawns','lastMagicDawn','conditions','exhaustion','deathSaves','inspiration','inspirationSource','worldTime','lastLongRest','restEpoch','restHistory','milestones','conduitCircuit','conduitGrants','spellDiscoveries','toolChecks','ownerTurnHistory','counters'])if(old[key]!==undefined)next[key]=structuredClone(old[key]);
  next.pools = reconcileBalances(before.resources, old.pools, after.resources, 'rebuild');
  next.slots = reconcileSlotTotals(before.spellSlots, old, after.spellSlots, 'rebuild');
  next.hitDice = reconcileDice(before.hitDice, old.hitDice, after.hitDice, 'rebuild');
  const newCharacter={...c,rulesLedger:ledger};
  next.featState=Object.fromEntries(Object.values(old.featState??{}).filter(record=>after.feats.includes(record.featId)).map(record=>[require('./runtime/featState').source(newCharacter,record.featId),structuredClone(record)]));
  if(after.spellcasting.shipwright){for(const key of ['folio','folioUnavailable','folioMemory','folioBookId','folioHistory'])if(old[key]!==undefined)next[key]=structuredClone(old[key]);next.folio=(next.folio??[]).filter(id=>!after.spellcasting.shipwright.folio.includes(id));next.folioMemory=(next.folioMemory??[]).filter(id=>next.preparations.shipwright.includes(id)||after.spellcasting.shipwright.alwaysPrepared.includes(id));}
  if(wishInterventionUnlocked(after.callingLevels.doctor)&&old.interventionCooldown)next.interventionCooldown=structuredClone(old.interventionCooldown);
  // Rebuild is a rules change, never a rest or a new equipment package.
  rules.runtime.validate(after,next);
  const inventory=structuredClone(c.inventory),endedAttunementIds=[];
  for(const item of inventory)if(item.attuned&&!require('../equipment/magic').eligible(item,after)){item.attuned=false;endedAttunementIds.push(item.instanceId);}
  require('../equipment/magic').validate({...c,inventory},after);
  return {runtime:next,inventory,consequences:{health:{before:old.health.current,after:next.health.current,max:after.health.max},pools:next.pools,slots:next.slots,hitDice:next.hitDice,endedEffectIds:old.effects.map(e=>e.id),temporaryHealthLost:old.temporaryHealth??0,animalForms:{before:old.animalForms??null,after:next.animalForms??null},createdSlotsLost:old.createdSlots??[],endedAttunementIds,inventoryUnchanged:!endedAttunementIds.length,copperUnchanged:true,newPoolsStartEmpty:true}};
}
function apply(c,type,p,access={}){
  available(c);
  if(type==='rebuild.preview'){
    fields(p,['ledger','reason','targetLevel','retainSavedLevels']);
    if(p.retainSavedLevels!==undefined && (p.retainSavedLevels!==true || c.campaignId))
      fail('Retaining upcoming levels is available for personal rebuilds only');
    const currentLevel=c.rulesLedger.levels.length;
    const targetLevel=p.targetLevel??currentLevel;
    if(!Number.isInteger(targetLevel)||targetLevel<1||targetLevel>currentLevel)fail('Choose a target level between 1 and the current level');
    if(c.campaignId&&targetLevel!==currentLevel)fail('Campaign rebuilds must preserve the current level',403);
    if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)fail('Provide a rebuild reason');
    const ledger=structuredClone(p.ledger);if(!ledger?.creation)fail('Complete the origin, background and point-buy rebuild');
    const adoptsLineage = !c.campaignId && c.rulesLedger.version === 3 && ledger.version === 4;
    if(ledger.version!==c.rulesLedger.version && !adoptsLineage)fail('A rebuild cannot change ledger version');
    if(ledger.version===4 && c.campaignId){
      if(!isDeepStrictEqual(ledger.creation.lineage,c.rulesLedger.creation.lineage)||
        (Array.isArray(ledger.levels)&&ledger.levels.some((event,index)=>!isDeepStrictEqual(event?.lineageForm,c.rulesLedger.levels[index]?.lineageForm))))
        fail('A rebuild must preserve Lineage and historical animal form selections');
    }
    if(Array.isArray(ledger.levels))for(const [index,event] of ledger.levels.entries()){
      if(event?.folioAtSpellGrant===undefined)continue;
      const saved=c.rulesLedger.levels[index];
      const choice=index===17?'spellMastery':'signatureSpells';
      if(JSON.stringify(event.folioAtSpellGrant)!==JSON.stringify(saved?.folioAtSpellGrant)||
        JSON.stringify(event.choices?.[choice])!==JSON.stringify(saved?.choices?.[choice]))fail('Cannot change a historical spell grant backed by a saved folio');
    }
    ledger.revision=c.rulesLedger.revision+1;
    let summary=p.retainSavedLevels ? replaySavedChoices(ledger,c.rulesLedger) :
      rules.replay(ledger,{validateStartingTraining:validateStartingTraining(ledger,c.rulesLedger)});
    if(ledger.levels.length>targetLevel)fail('A rebuild cannot grant additional levels');
    if(p.retainSavedLevels) summary=retainPersonalLevels(ledger,c.rulesLedger,targetLevel,summary);
    delete c.rulesRuntime.rebuildProposal;
    if(!summary.decisionsComplete||ledger.levels.length!==targetLevel)return {type,draftLedger:ledger,summary,complete:false,targetLevel};
    const {consequences}=plan(c,summary,ledger),baseHash=fingerprint(c);
    const proposalId=hash({ledger,reason:p.reason.trim(),baseHash,revision:c.rulesRuntime.revision});
    c.rulesRuntime.rebuildProposal={proposalId,ledger,reason:p.reason.trim(),baseHash,consequences,approvedBy:null};c.rulesRuntime.revision++;
    return {type,draftLedger:ledger,summary,complete:true,proposalId,consequences};
  }
  const decision = type === 'rebuild.approve' || type === 'rebuild.reject';
  fields(p, decision ? ['proposalId', ...(type === 'rebuild.reject' ? ['reason'] : [])] : ['proposalId','acceptConsequences']);
  const proposal=c.rulesRuntime.rebuildProposal;
  if(!proposal||p.proposalId!==proposal.proposalId)fail('Preview the complete matching rebuild proposal first',409);
  if(fingerprint(c)!==proposal.baseHash)fail('Character changed after the rebuild preview; preview it again',409);
  if(proposal.rejectedBy)fail('This rebuild was rejected. Preview a new proposal first',409);
  if(decision){
    if(!access.gmAllowed&&c.campaignId)fail('Only the registered campaign GM can review this rebuild',403);
    if(proposal.approvedBy)fail('This rebuild is already approved',409);
    if(type==='rebuild.reject'){
      if(!c.campaignId||!access.gmAllowed||!access.userId)fail('Only the registered campaign GM can reject this rebuild',403);
      if(p.reason!==undefined&&(typeof p.reason!=='string'||p.reason.length>500))fail('Use at most 500 characters for the rejection reason');
      proposal.rejectedBy=access.userId;
      proposal.rejectionReason=p.reason?.trim()??'';
      c.rulesRuntime.revision++;
      return {type,proposalId:proposal.proposalId,rejectedBy:proposal.rejectedBy,reason:proposal.rejectionReason};
    }
    proposal.approvedBy=access.userId??String(c.owner??'solo-owner');c.rulesRuntime.revision++;
    return {type,proposalId:proposal.proposalId,approvedBy:proposal.approvedBy};
  }
  if(type!=='rebuild.commit')fail('Unknown rebuild operation');
  if(c.campaignId&&!proposal.approvedBy)fail('The campaign GM must approve this exact rebuild proposal',403);
  if(p.acceptConsequences!==true)fail('Accept the previewed resource consequences before committing');
  const summary=rules.replay(proposal.ledger);if(!summary.decisionsComplete||summary.totalLevel>c.rulesLedger.levels.length||(c.campaignId&&summary.totalLevel!==c.rulesLedger.levels.length))fail('A rebuild must contain complete choices at an eligible level');
  const {runtime,inventory,consequences}=plan(c,summary,proposal.ledger);c.rulesRuntime=runtime;c.inventory=inventory;c.rulesLedger=proposal.ledger;c.attributes=summary.attributes;c.origin=summary.originId;c.calling=proposal.ledger.levels[0].callingId;
  return {type,proposalId:proposal.proposalId,approvedBy:proposal.approvedBy??access.userId??String(c.owner??'solo-owner'),reason:proposal.reason,consequences};
}
module.exports={apply,plan};
