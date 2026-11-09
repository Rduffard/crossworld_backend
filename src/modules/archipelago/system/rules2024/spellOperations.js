const rules=require('./rules');
const castingTurn=require('./castingTurn');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function cast(character,baseSummary,p){
  if(Object.keys(p).some(k=>!['spellId','callingId','slotLevel','source','metamagic','parameters','targets','ritual','materialIds','turnId','contingency','trigger'].includes(k)))fail('Invalid spell casting fields');
  const spell=rules.spells.find(s=>s.id===p.spellId);if(!spell)fail('Unknown spell');
  const isContingency=spell.id==='contingency';
  if(isContingency&&(!p.contingency||p.targets?.length)||!isContingency&&p.contingency!==undefined)fail('Contingency requires a second spell and targets only you');
  if(p.source!==undefined&&typeof p.source!=='string')fail('Invalid spell source');
  if(p.ritual!==undefined&&typeof p.ritual!=='boolean')fail('Invalid ritual choice');
  if(p.targets!==undefined&&(!Array.isArray(p.targets)||p.targets.length>100||new Set(p.targets).size!==p.targets.length||p.targets.some(id=>typeof id!=='string'||!id.trim()||id.length>100)))fail('Choose distinct spell targets');
  if(p.parameters!==undefined&&(!p.parameters||typeof p.parameters!=='object'||Array.isArray(p.parameters)||Object.keys(p.parameters).some(k=>!['overchannel','focusId','damageType','originalDamageType','heightenedTarget','exemptTargets','freeMetamagic','originRelayId','relayOriginConfirmed','teleport','sculptTargets','sculptConfirmed','dragonNoConcentration'].includes(k))))fail('Invalid casting parameters');
  const runtime=require('./runtime');
  const summary=runtime.project(baseSummary,character.rulesRuntime,character);
  const state=structuredClone(character.rulesRuntime),casting=summary.spellcasting[p.callingId];
  if(isContingency&&(state.inCombat||state.ownerTurn?.open))fail('Complete Contingency\'s ten-minute casting outside a recorded turn');
  const dragonCompanion=spell.id==='summon-dragon'&&p.callingId==='tidecaller'&&summary.paths.tidecaller==='omen-diver'&&summary.callingLevels.tidecaller>=18;
  if(p.source==='dragon-companion'&&!dragonCompanion)fail('Dragon Companion free casting requires Omen Diver eighteen and Summon Dragon');
  if(p.parameters?.dragonNoConcentration!==undefined&&(!dragonCompanion||typeof p.parameters.dragonNoConcentration!=='boolean'))fail('Only Dragon Companion can change this casting to its one-minute non-Concentration form');
  if(require('./vitality').incapacitated(state))fail('Incapacitated creatures cannot cast spells');
  if(state.concentrationChecks?.length)fail('Resolve pending Concentration saves before casting');
  const initiate=summary.featSpellcasters?.find(s=>s.grantKey===p.source);
  const intervention=p.source==='intervention';
  if(intervention&&(p.callingId!=='doctor'||summary.callingLevels.doctor<10||p.slotLevel!==undefined||p.ritual||spell.castingTime.startsWith('Reaction')||!(spell.callings.includes('doctor')&&spell.level<=5||spell.id==='wish'&&summary.callingLevels.doctor===20)))fail('Divine Intervention requires an eligible Doctor spell or level-twenty Wish, with no slot or ritual');
  if(!initiate&&!['intervention','slot','ritual','mastery','signature','favored-enemy','smite-free','steed-free','dragon-companion',undefined].includes(p.source))fail('Unknown spell source');
  const casterSpells=casting?[...casting.cantrips,...state.preparations[p.callingId],...casting.alwaysPrepared,...(dragonCompanion?[spell.id]:[])]:[];
  if(!intervention&&(initiate?![...initiate.cantrips,initiate.spell].includes(spell.id):!casting||!casterSpells.includes(spell.id)&&!(p.ritual&&p.callingId==='shipwright'&&casting.folio.includes(spell.id))))fail('Spell is not available from this source');
  const equipment=require('../../equipment').derive(character);
  if(equipment.restrictions.spellcastingBlocked)fail('Armor prevents spellcasting');
  if(state.effects.some(e=>e.featureId==='calling:reaver:rage:1'&&(e.expiresAt===undefined||e.expiresAt>require('./clock').now(state))))fail('Cannot cast spells during Rage');
  if(p.ritual&&(!spell.ritual||initiate||!casting))fail('This source has no ritual option');
  if(p.source==='ritual'&&!p.ritual)fail('Ritual source requires ritual casting');
  if(spell.level===0&&p.slotLevel!==undefined)fail('Cantrips do not expend spell slots');
  if(p.ritual&&(p.slotLevel!==undefined||p.metamagic?.length))fail('Ritual cannot expend a slot or apply casting Metamagic');
  const selected=p.metamagic??[];
  const cost=require('./metamagic').validate(summary,selected,spell,state,p.parameters??{});
  const castingTrigger=!intervention&&require('./spellProfiles')[spell.id].castingTrigger;
  let triggerEventId;
  if(castingTrigger){
    const trigger=p.trigger;
    if(!trigger||typeof trigger!=='object'||Array.isArray(trigger)||Object.keys(trigger).some(key=>!['eventId','confirmed'].includes(key))||trigger.confirmed!==true||!castingTurn.validLabel(trigger.eventId))fail('Confirm the printed spell trigger and record its event ID');
    triggerEventId=trigger.eventId.trim();
    if(state.castings?.some(cast=>cast.spellId===spell.id&&cast.triggerEventId===triggerEventId))fail('This spell trigger has already been resolved');
    if(castingTrigger==='hit'&&(p.targets?.length!==1||state.inCombat&&!state.ownerTurn?.open))fail('Confirm the one creature you just hit and cast on your own turn');
  }else if(p.trigger!==undefined)fail('This spell does not use a casting trigger');
  for(const target of [...(selected.includes('careful-spell')?p.parameters.exemptTargets:[]),...(selected.includes('heightened-spell')?[p.parameters.heightenedTarget]:[])])if(!p.targets?.includes(target))fail('Metamagic target must be included among the casting targets');
  if(cost>(state.pools['tidecaller:sorcery-points']??0))fail('Insufficient Sorcery Points');
  if(cost)state.pools['tidecaller:sorcery-points']-=cost;
  let spentSlot=false,usedSlot=false,freePool,spellRecall,interventionCooldown;
  if(intervention){
    freePool='doctor:intervention';if(!(state.pools[freePool]>0)||state.interventionCooldown?.longRestsRemaining>0)fail('Divine Intervention is expended or its Wish cooldown remains');state.pools[freePool]--;
    if(spell.id==='wish'){const rolls=[require('node:crypto').randomInt(1,5),require('node:crypto').randomInt(1,5)];state.interventionCooldown={source:'calling:doctor:greater-divine-intervention:20',rolls,longRestsRemaining:rolls[0]+rolls[1]};interventionCooldown=structuredClone(state.interventionCooldown);}
  }
  const level=p.slotLevel??spell.level;
  if(spell.level>0&&!p.ritual&&!intervention){
    if(initiate&&p.source===initiate.grantKey&&p.slotLevel===undefined)freePool=initiate.poolId;
    else if(p.source==='mastery'){
      if(!casting?.spellMastery.includes(spell.id)||p.slotLevel!==undefined)fail('Ineligible Spell Mastery casting');
    }else if(p.source==='signature'){
      if(!casting?.signatureSpells.includes(spell.id)||p.slotLevel!==undefined)fail('Ineligible Signature Spell');
      freePool='shipwright:signature:'+spell.id;
    }else if(p.source==='favored-enemy'){
      if(p.callingId!=='navigator'||spell.id!=='hunter-s-mark'||p.slotLevel!==undefined)fail('Favored Enemy only grants Hunter’s Mark');
      freePool='navigator:favored-enemy';
    }else if(p.source==='dragon-companion'){
      if(!dragonCompanion||p.slotLevel!==undefined)fail('Dragon Companion free casting requires Omen Diver eighteen and Summon Dragon');freePool='omen-diver:companion';
    }else if(p.source==='smite-free'||p.source==='steed-free'){
      if(p.callingId!=='warden'||spell.id!==(p.source==='smite-free'?'divine-smite':'find-steed')||p.slotLevel!==undefined)fail('Wrong feature-granted spell');
      freePool='warden:'+p.source;
    }else{
      if(!Number.isSafeInteger(p.slotLevel)||p.slotLevel<spell.level||p.slotLevel>state.slots.length||state.slots[p.slotLevel-1]<1)fail('Choose an available spell slot');
      usedSlot=true;({spentSlot,spellRecall}=require('./slotCasting').spend(state,p.slotLevel,!isContingency&&summary.feats.includes('boon-of-spell-recall')));
    }
    if(freePool){if((state.pools[freePool]??0)<1)fail('Free casting is expended');state.pools[freePool]--;}
  }
  const quickened=selected.includes('quickened-spell');
  const turnId=castingTurn.resolve(state,p.turnId,quickened);
  if(quickened&&!state.ownerTurn?.open)fail('Quickened Spell requires a Bonus Action on your own turn');
  // Table-only labels remain available for ancillary features outside a tracked turn.
  p={...p,turnId:turnId??p.turnId};
  if(p.parameters?.freeMetamagic&&!p.turnId)fail('Record a turn for Arcane Apotheosis');
  if(turnId||p.parameters?.freeMetamagic||p.parameters?.originRelayId||p.parameters?.teleport)castingTurn.record(state,p.turnId,{spentSlot,level:spell.level,quickened,freeMetamagic:Boolean(p.parameters?.freeMetamagic)});
  const relayParameters=p.parameters??{};
  if(relayParameters.originRelayId!==undefined||relayParameters.teleport!==undefined){
    if(initiate||p.callingId!=='shipwright'||summary.paths.shipwright!=='sparkwrite-aetherist'||!p.turnId)fail('Relay casting requires a Shipwright spell and a turn label');
    const relay=id=>state.effects.find(e=>e.id===id&&e.objectType==='relay'&&e.health.current>0&&e.expiresAt>require('./clock').now(state));
    const turn=state.turnCasting[p.turnId];
    if(relayParameters.originRelayId!==undefined){
      if(spell.level!==0||!relay(relayParameters.originRelayId)||relayParameters.relayOriginConfirmed!==true||turn.relayCantrip)fail('Originate one cantrip per turn from a live relay with your own sight');
      turn.relayCantrip=true;
    }
    if(relayParameters.teleport!==undefined){
      const t=relayParameters.teleport;
      if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>!['from','to','confirmed'].includes(k))||summary.callingLevels.shipwright<14||spell.level<1||turn.relayTeleport||t.from===t.to||!relay(t.from)||!relay(t.to)||t.confirmed!==true)fail('Twin Circuit requires two live relays within 60 feet, an eligible spell and an unused teleport this turn');
      turn.relayTeleport=true;
      for(const object of state.effects.filter(e=>e.objectType==='relay'))object.withinTenFeet=false;
      relay(t.to).withinTenFeet=true;
    }
  }
  const management=require('./metamagic').project(spell,selected,p.parameters??{},level);
  if(p.source==='mastery'&&management.castingTime==='Action or Ritual')management.castingTime='Action';
  const concentration=spell.concentration&&!p.parameters?.dragonNoConcentration;
  if(p.parameters?.dragonNoConcentration)management.durationSeconds=selected.includes('extended-spell')?120:60;
  if(dragonCompanion)management.components=management.components.filter(c=>c!=='M');
  require('./casterPathOperations').convert(state,summary,p,management);
  if(p.parameters?.sculptTargets?.length){const targets=p.parameters.sculptTargets;if(summary.paths.shipwright!=='powder-saint'||summary.callingLevels.shipwright<6||spell.school!=='evocation'||!management.savingThrow||p.parameters.sculptConfirmed!==true||!Array.isArray(targets)||targets.length>1+level||new Set(targets).size!==targets.length||targets.some(id=>typeof id!=='string'||!id.trim()||id===String(character._id??'self')||!p.targets?.includes(id)))fail('Sculpt Spells requires visible other targets of this Evocation save spell, at most one plus casting level');management.sculptTargets=[...targets];}
  if(summary.paths.doctor==='sanctuary-hand')management.healingFeatures={maximumHealingDice:summary.callingLevels.doctor>=17,additionalHealingOnCastingTurn:usedSlot?2+level:0,blessedHealerEligible:usedSlot&&summary.callingLevels.doctor>=6};
  if(intervention){management.components=management.components.filter(c=>c!=='M');management.castingTime='Magic action';}
  const components=require('./spellComponents').validate({...character,rulesRuntime:state},spell,management,p.callingId,p.parameters?.focusId);
  const materialState={...character,rulesRuntime:state,inventory:structuredClone(character.inventory)};
  if(intervention&&p.materialIds?.length)fail('Divine Intervention does not need Material components');
  const consumedMaterials=intervention||dragonCompanion?[]:require('./spellMaterials').spend(materialState,spell,p.materialIds??[],p.targets??[]);
  let contingency;
  if(isContingency){
    if(!spentSlot)fail('Contingency requires a primary spell slot');
    contingency=require('./contingency').prepare(materialState,summary,p.contingency,p.materialIds[0]);
    state.effects=state.effects.filter(e=>e.featureId!=='spell:contingency');
    if(!materialState.inventory.some(item=>item.instanceId===contingency.statueId))fail('Contingency requires keeping its statuette');
  }
  if(concentration)state.effects=state.effects.filter(e=>!e.concentration);
  if(concentration)state.concentrationChecks=[];
  const castId=require('node:crypto').randomUUID();
  const sanguineSurge=require('./conduitOperations').consumeSurge(state,management,castId,spell.id);
  const effect={id:castId,featureId:'spell:'+spell.id,name:spell.name,source:p.source??p.callingId,targets:p.targets??[],concentration,
    slotLevel:level,metamagic:selected,note:spell.description,parameters:p.parameters??{},createdAt:require('./clock').now(state),createdTurn:state.ownerTurn?.number??0};
  Object.assign(effect,{management},management.durationSeconds?{expiresAt:effect.createdAt+management.durationSeconds*1000}:{});
  if(contingency)Object.assign(effect,{contingency,targets:[String(character._id??'self')]});
  if(concentration||management.durationSeconds)state.effects.push(effect);
  if(spell.id==='divine-smite'&&summary.paths.warden==='leviathan-anchor'&&summary.callingLevels.warden>=15){state.effects=state.effects.filter(e=>!e.smiteProtection);state.effects.push({id:castId+'-protection',featureId:'path:leviathan-anchor:smite-of-protection:15',name:'Smite of Protection',smiteProtection:true,createdAt:effect.createdAt,createdTurn:state.ownerTurn?.number??0,ends:'start-of-next-turn'});}
  let overchannel;
  if(p.parameters?.overchannel!==undefined&&typeof p.parameters.overchannel!=='boolean')fail('Choose whether to use Overchannel');
  if(p.parameters?.overchannel){
    if(initiate||p.callingId!=='shipwright'||summary.paths.shipwright!=='powder-saint'||summary.callingLevels.shipwright<14||p.ritual||!Number.isSafeInteger(p.slotLevel)||p.slotLevel<1||p.slotLevel>5||!management.damageTypes.length||typeof p.turnId!=='string'||!p.turnId.trim())fail('Overchannel requires a damaging Shipwright spell cast with a level-one-through-five slot and a turn label');
    const uses=(state.counters.overchannel??0)+1;state.counters.overchannel=uses;
    management.maximumDamageOnTurn=p.turnId;overchannel={uses,maximumDamageOnTurn:p.turnId,backlashDice:[],damage:0};
    if(uses>1){
      overchannel.backlashDice=Array.from({length:uses*p.slotLevel},()=>require('node:crypto').randomInt(1,13));overchannel.damage=overchannel.backlashDice.reduce((a,b)=>a+b,0);
      overchannel.damageOutcome=require('./vitality').damage({...character,rulesRuntime:state},summary,{amount:overchannel.damage,damageType:'necrotic',confirmed:true},{ignoreMitigation:true});
    }
  }
  state.castings??=[];
  if(state.castings.length>=200)fail('Casting history is full; complete a rest before casting again');
  state.castings.push({castId,spellId:spell.id,callingId:p.callingId,source:effect.source,slotLevel:level,spentSlot,usedSlot,turnId:p.turnId,targets:p.targets??[],metamagic:selected,management,...(triggerEventId?{triggerEventId}:{}),...(sanguineSurge?{sanguineSurge}:{}),attackModifier:initiate?.attackModifier??casting.attackModifier,castingModifier:initiate?.modifier??casting.modifier,createdAt:effect.createdAt,rerolls:[]});
  state.revision++;
  if(management.components.includes('V'))state.conditions=state.conditions.filter(e=>e.conditionId!=='invisible'||e.source!=='hide');
  runtime.validate(baseSummary,state);
  character.rulesRuntime=state;character.inventory=materialState.inventory;character.goldCp=materialState.goldCp;
  return {type:'spell.cast',castId,spellId:spell.id,slotLevel:level,spentSlot,freePool,spellRecall,overchannel,interventionCooldown,sanguineSurge,metamagicCost:cost,consumedMaterials,components,management,description:spell.description,...(contingency?{contingency}:{})};
}
module.exports={cast};
