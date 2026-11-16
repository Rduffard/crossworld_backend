const clock=require('../combat/effects/clock');
const { folioCopyEligible, folioCopyTerms, folioRebuildTerms, folioMemoryAfterLoss,
  folioRebuildCandidates } = require('@crossworld/sanguine-engine/callings');
const { resolveScrollCheck } = require('@crossworld/sanguine-engine/spells/scrolls');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
const { label } = require('../characters/runtime/runtimeJournals');
function apply(c,summary,type,p,operationId,ledgerFolio){
  const state=c.rulesRuntime,casting=summary.spellcasting.shipwright;
  if(!casting)fail('Folio work requires a Shipwright');
  const allowed=type==='spells.copy'?['spellId','discoveryId','scrollId','startedAt','completedAt','confirmed']:type==='folio.lose'?['folioId','confirmed']:['spellIds','folioId','startedAt','completedAt','confirmed'];
  if(!p||Object.keys(p).some(k=>!allowed.includes(k))||p.confirmed!==true)fail('Confirm the folio operation and its source/time facts');
  if(type==='folio.lose'){
    if(!label(p.folioId))fail('Identify the lost folio');
    state.folioUnavailable=[...new Set([...(state.folioUnavailable??[]),...casting.folio])];
    state.folioMemory=folioMemoryAfterLoss({prepared:state.preparations.shipwright,alwaysPrepared:casting.alwaysPrepared,
      available:casting.folio,memorized:state.folioMemory??[]});
    state.folioBookId=p.folioId;state.revision++;
    return {type,folioId:p.folioId,lostSpellIds:[...casting.folio],memorizedSpellIds:[...state.folioMemory]};
  }
  if(require('../combat/vitality/vitality').incapacitated(state))fail('Transcription requires a conscious Shipwright');
  if(state.restSession||state.ownerTurn?.open||state.inCombat)fail('Complete combat and any rest before transcription');
  let spellIds,costCp,hours,scroll;
  if(type==='spells.copy'){
    if(p.scrollId!==undefined){scroll=c.inventory.find(i=>i.instanceId===p.scrollId&&i.definitionId==='spell-scroll'&&i.spellId===p.spellId);if(!scroll)fail('Choose an owned scroll with the exact copied spell identity');}
    else if(!label(p.discoveryId)||!state.spellDiscoveries?.some(d=>d.discoveryId===p.discoveryId&&d.spellId===p.spellId))fail('Choose a GM-recorded discovery for this spell');
    const spell=require('../system/rules').spells.find(s=>s.id===p.spellId);
    if(!folioCopyEligible(spell,casting))fail('Choose an eligible unknown Shipwright folio spell');
    spellIds=[spell.id];
    ({costCp,hours}=folioCopyTerms(spell.level));
  }else if(type==='folio.rebuild'){
    if(!label(p.folioId)||!Array.isArray(p.spellIds)||!p.spellIds.length||new Set(p.spellIds).size!==p.spellIds.length)fail('Choose a replacement folio and distinct remembered spells');
    const remembered=folioRebuildCandidates({prepared:state.preparations.shipwright,alwaysPrepared:casting.alwaysPrepared,
      memorized:state.folioMemory??[],unavailable:state.folioUnavailable??[]});
    if(p.spellIds.some(id=>!remembered.includes(id)))fail('Rebuild only currently prepared spells lost from your folio');
    spellIds=p.spellIds;
    const levels=spellIds.map(id=>require('../system/rules').spells.find(s=>s.id===id).level);
    ({costCp,hours}=folioRebuildTerms(levels));
  }else fail('Unknown folio operation');
  if(!Number.isSafeInteger(p.startedAt)||!Number.isSafeInteger(p.completedAt)||p.startedAt<0||p.completedAt-p.startedAt<hours*3600000||state.worldTime!==undefined&&p.startedAt<state.worldTime)fail('Record sufficient transcription time without moving the world clock backward');
  if(!Number.isSafeInteger(c.goldCp)||c.goldCp<costCp)fail('Insufficient copper for transcription');
  clock.advance(state,p.startedAt);clock.advance(state,p.completedAt);c.goldCp-=costCp;
  let scrollCheck;
  if(scroll){const roll=require('node:crypto').randomInt(1,21),spell=require('../system/rules').spells.find(s=>s.id===p.spellId);scrollCheck={...resolveScrollCheck(spell.level,roll,summary.skillModifiers.arcana),scrollDestroyed:true};c.inventory=c.inventory.filter(i=>i.instanceId!==scroll.instanceId);if(!scrollCheck.success)spellIds=[];}
  state.folioUnavailable=(state.folioUnavailable??[]).filter(id=>!spellIds.includes(id));
  state.folio=[...new Set([...(state.folio??[]),...spellIds.filter(id=>!ledgerFolio.includes(id))])];
  if(type==='folio.rebuild')state.folioBookId=p.folioId;
  state.folioHistory=[...(state.folioHistory??[]),{operationId,type,spellIds:[...spellIds],discoveryId:p.discoveryId??null,scrollId:p.scrollId??null,scrollCheck,folioId:p.folioId??null,startedAt:p.startedAt,completedAt:p.completedAt,costCp}].slice(-200);
  state.revision++;
  return {type,spellIds,costCp,hours,discoveryId:p.discoveryId,folioId:p.folioId,completedAt:p.completedAt,...scrollCheck};
}
module.exports={apply};
