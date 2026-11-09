const {randomInt,randomUUID}=require('node:crypto');
const rules=require('../system/rules2024/rules');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function cast(c,summary,p){
  if(Object.keys(p).some(k=>!['instanceId','callingId','targets','turnId','confirmed'].includes(k))||p.confirmed!==true)fail('Confirm completion of the scroll spell normal casting time; interrupted castings leave the scroll intact');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId&&i.definitionId==='spell-scroll'),spell=rules.spells.find(s=>s.id===item?.spellId),state=c.rulesRuntime;
  if(!item||!spell)fail('Choose an owned identified Spell Scroll');
  if(spell.id==='contingency')fail('Contingency requires two spell slots and its statuette; use prepared casting');
  if(require('../system/rules2024/vitality').incapacitated(state)||state.effects.some(e=>e.rage))fail('Cannot read a scroll while Incapacitated or Raging');
  if(state.concentrationChecks?.length)fail('Resolve pending Concentration saves before casting');
  if(state.restSession)fail('Record the rest interruption before casting a scroll');
  const thief=summary.paths.corsair==='reef-knife'&&summary.callingLevels.corsair>=13,casting=summary.spellcasting[p.callingId];
  if(!thief&&(!casting||!spell.callings.includes(p.callingId)))fail('The scroll spell must be on your Calling spell list');
  if(p.targets!==undefined&&(!Array.isArray(p.targets)||p.targets.length>100||new Set(p.targets).size!==p.targets.length||p.targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100)))fail('Choose distinct stable scroll targets');
  const castingTurn=require('../system/rules2024/castingTurn'),turnId=castingTurn.resolve(state,p.turnId);
  if(require('./index').derive(c).restrictions.spellcastingBlocked)fail('Armor prevents scroll spellcasting');
  const management=require('../system/rules2024/metamagic').project(spell,[],{},spell.level);management.components=management.components.filter(x=>x!=='M');
  require('../system/rules2024/spellComponents').validate(c,spell,management,p.callingId);
  const needsCheck=thief?spell.level>1:spell.level>casting.slots.length,roll=needsCheck?randomInt(1,21):undefined,modifier=thief?summary.skillModifiers.arcana:casting.modifier,dc=10+spell.level,success=!needsCheck||roll+modifier>=dc;
  if((state.castings??[]).length>=200)fail('Casting history is full; complete a rest');
  if(success)castingTurn.record(state,turnId,{level:spell.level});
  c.inventory=c.inventory.filter(i=>i.instanceId!==item.instanceId);
  if(management.components.includes('V'))state.conditions=state.conditions.filter(e=>e.conditionId!=='invisible'||e.source!=='hide');
  const result={type:'scroll.cast',instanceId:item.instanceId,spellId:spell.id,scrollDestroyed:true,success,...(needsCheck?{rolls:[roll],checkTotal:roll+modifier,dc}:{}),description:spell.description};
  if(success){
    const castId=randomUUID(),saveDC=[13,13,13,15,15,17,17,18,18,19][spell.level],attackModifier=saveDC-8;
    const effect={id:castId,featureId:'spell:'+spell.id,name:spell.name,source:'scroll:'+item.instanceId,targets:p.targets??[],concentration:spell.concentration,slotLevel:spell.level,management,createdAt:require('../system/rules2024/clock').now(state),createdTurn:state.ownerTurn?.number??0};
    if(management.durationSeconds)effect.expiresAt=effect.createdAt+management.durationSeconds*1000;
    if(spell.concentration){state.effects=state.effects.filter(e=>!e.concentration);state.concentrationChecks=[];}
    if(spell.concentration||management.durationSeconds)state.effects.push(effect);
    const sanguineSurge=require('../system/rules2024/conduitOperations').consumeSurge(state,management,castId,spell.id);
    state.castings??=[];state.castings.push({castId,spellId:spell.id,callingId:thief?'corsair':p.callingId,source:effect.source,slotLevel:spell.level,turnId:turnId??p.turnId,targets:p.targets??[],management,attackModifier,saveDC,createdAt:effect.createdAt,rerolls:[],...(sanguineSurge?{sanguineSurge}:{})});
    Object.assign(result,{castId,slotLevel:spell.level,management,saveDC,attackModifier,sanguineSurge});
  }
  state.revision++;return result;
}
module.exports={cast};
