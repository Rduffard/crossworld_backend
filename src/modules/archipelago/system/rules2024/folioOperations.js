const clock=require('./clock');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function label(value){return typeof value==='string'&&value.trim()&&value.length<=100;}
function apply(c,summary,type,p,operationId){
  const state=c.rulesRuntime,casting=summary.spellcasting.shipwright;
  if(!casting)fail('Folio work requires a Shipwright');
  const allowed=type==='spells.copy'?['spellId','discoveryId','scrollId','startedAt','completedAt','confirmed']:type==='folio.lose'?['folioId','confirmed']:['spellIds','folioId','startedAt','completedAt','confirmed'];
  if(!p||Object.keys(p).some(k=>!allowed.includes(k))||p.confirmed!==true)fail('Confirm the folio operation and its source/time facts');
  if(type==='folio.lose'){
    if(!label(p.folioId))fail('Identify the lost folio');
    state.folioUnavailable=[...new Set([...(state.folioUnavailable??[]),...casting.folio])];
    state.folioMemory=[...new Set([...state.preparations.shipwright,...casting.alwaysPrepared].filter(id=>casting.folio.includes(id)||(state.folioMemory??[]).includes(id)))];
    state.folioBookId=p.folioId;state.revision++;
    return {type,folioId:p.folioId,lostSpellIds:[...casting.folio],memorizedSpellIds:[...state.folioMemory]};
  }
  if(require('./vitality').incapacitated(state))fail('Transcription requires a conscious Shipwright');
  if(state.restSession||state.ownerTurn?.open||state.inCombat)fail('Complete combat and any rest before transcription');
  let spellIds,costCp,hours,scroll;
  if(type==='spells.copy'){
    if(p.scrollId!==undefined){scroll=c.inventory.find(i=>i.instanceId===p.scrollId&&i.definitionId==='spell-scroll'&&i.spellId===p.spellId);if(!scroll)fail('Choose an owned scroll with the exact copied spell identity');}
    else if(!label(p.discoveryId)||!state.spellDiscoveries?.some(d=>d.discoveryId===p.discoveryId&&d.spellId===p.spellId))fail('Choose a GM-recorded discovery for this spell');
    const spell=require('./rules').spells.find(s=>s.id===p.spellId);
    if(!spell?.callings.includes('shipwright')||spell.level<1||spell.level>casting.slots.length||casting.folio.includes(spell.id))fail('Choose an eligible unknown Shipwright folio spell');
    spellIds=[spell.id];costCp=spell.level*5000;hours=spell.level*2;
  }else if(type==='folio.rebuild'){
    if(!label(p.folioId)||!Array.isArray(p.spellIds)||!p.spellIds.length||new Set(p.spellIds).size!==p.spellIds.length)fail('Choose a replacement folio and distinct remembered spells');
    const remembered=new Set([...state.preparations.shipwright,...casting.alwaysPrepared].filter(id=>state.folioMemory?.includes(id)));
    if(p.spellIds.some(id=>!remembered.has(id)||!state.folioUnavailable?.includes(id)))fail('Rebuild only currently prepared spells lost from your folio');
    spellIds=p.spellIds;const levels=spellIds.map(id=>require('./rules').spells.find(s=>s.id===id).level);costCp=levels.reduce((a,b)=>a+b,0)*1000;hours=levels.reduce((a,b)=>a+b,0);
  }else fail('Unknown folio operation');
  if(!Number.isSafeInteger(p.startedAt)||!Number.isSafeInteger(p.completedAt)||p.startedAt<0||p.completedAt-p.startedAt<hours*3600000||state.worldTime!==undefined&&p.startedAt<state.worldTime)fail('Record sufficient transcription time without moving the world clock backward');
  if(!Number.isSafeInteger(c.goldCp)||c.goldCp<costCp)fail('Insufficient copper for transcription');
  clock.advance(state,p.startedAt);clock.advance(state,p.completedAt);c.goldCp-=costCp;
  let scrollCheck;
  if(scroll){const roll=require('node:crypto').randomInt(1,21),spell=require('./rules').spells.find(s=>s.id===p.spellId),checkTotal=roll+summary.skillModifiers.arcana,dc=10+spell.level;scrollCheck={rolls:[roll],checkTotal,dc,success:checkTotal>=dc,scrollDestroyed:true};c.inventory=c.inventory.filter(i=>i.instanceId!==scroll.instanceId);if(!scrollCheck.success)spellIds=[];}
  const baseline=require('./index').replay(c.rulesLedger).spellcasting.shipwright.folio;
  state.folioUnavailable=(state.folioUnavailable??[]).filter(id=>!spellIds.includes(id));
  state.folio=[...new Set([...(state.folio??[]),...spellIds.filter(id=>!baseline.includes(id))])];
  if(type==='folio.rebuild')state.folioBookId=p.folioId;
  state.folioHistory=[...(state.folioHistory??[]),{operationId,type,spellIds:[...spellIds],discoveryId:p.discoveryId??null,scrollId:p.scrollId??null,scrollCheck,folioId:p.folioId??null,startedAt:p.startedAt,completedAt:p.completedAt,costCp}].slice(-200);
  state.revision++;
  return {type,spellIds,costCp,hours,discoveryId:p.discoveryId,folioId:p.folioId,completedAt:p.completedAt,...scrollCheck};
}
function validate(state){
  for(const key of ['folioUnavailable','folioMemory'])if(state[key]!==undefined&&(!Array.isArray(state[key])||state[key].length>400||new Set(state[key]).size!==state[key].length||state[key].some(id=>!require('./rules').spells.some(s=>s.id===id&&s.callings.includes('shipwright')&&s.level>0))))fail('Invalid saved folio availability');
  if(state.spellDiscoveries!==undefined&&(!Array.isArray(state.spellDiscoveries)||state.spellDiscoveries.length>1000||state.spellDiscoveries.some(d=>!d||!label(d.discoveryId)||!label(d.authorizedBy)||!require('./rules').spells.some(s=>s.id===d.spellId&&s.callings.includes('shipwright')&&s.level>0))))fail('Invalid saved discoveries');
}
module.exports={apply,validate};
