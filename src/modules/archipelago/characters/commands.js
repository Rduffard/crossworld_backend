const {createHash}=require('node:crypto');
const rules=require('../system/rules2024');
function fail(message,statusCode=422,details={}){throw Object.assign(new Error(message),{statusCode,...details});}
const silentKeelId='path:drydock-ghost:silent-keel:10';
function removeShroudedTarget(state,effect,targetId){
  effect.targetIds=effect.targetIds.filter(id=>id!==targetId);
  if(!effect.targetIds.length){
    state.effects=state.effects.filter(active=>active!==effect);
    require('../system/rules2024/clock').expire(state);
  }
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function validateEnvelope(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['operationId','expectedRevision','rulesVersion','type','payload'].includes(k)))fail('Invalid command envelope');
  if(typeof body.operationId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(body.operationId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('Command requires operationId and expectedRevision');
  if(body.rulesVersion!=='SA-CHAR-1')fail('Rules version changed; reload character rules',409,{code:'rules_version_mismatch',fieldPath:'rulesVersion'});
  if(typeof body.type!=='string'||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))fail('Command requires a type and payload');
  return createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
}
function apply(character,body,context={}){
  validateEnvelope(body);
  if(!Number.isSafeInteger(character.goldCp)||character.goldCp<0)fail('Recreate this experimental character using integer-copper storage',409);
  if(body.expectedRevision!==character.documentRevision)fail('Character changed; reload before saving',409,{code:'revision_conflict',fieldPath:'expectedRevision',currentRevision:character.documentRevision});
  const c=structuredClone(character),summary=rules.replay(c.rulesLedger),p=body.payload;
  if(require('./authority').gmCommands.includes(body.type)&&c.campaignId&&!context.gmAllowed)fail('This operation requires the campaign GM',403);
  if(character._id!==undefined)c._id=String(character._id);
  if(body.type!=='identity.patch')require('../system/rules2024/clock').expire(c.rulesRuntime);
  let result={type:body.type};
  if(body.type==='attack.record'){
    result=require('../system/rules2024/attackRecords').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='navigator.prey'){
    result=require('../system/rules2024/grayNetOperations').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='equipment.utilize'){
    result=require('../equipment/utilization').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='equipment.recover'){
    result=require('../equipment/utilization').recover(c,p);
  }else if(body.type==='equipment.flame'){
    result=require('../equipment/utilization').flame(c,p);
  }else if(body.type==='equipment.poison-hit'){
    result=require('../equipment/utilization').poisonHit(c,p);
  }else if(body.type==='spell.heal'){
    result=require('../system/rules2024/healingSpells').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='equipment.wear'){
    result=require('../equipment/magic').wear(c,summary,p);
  }else if(body.type==='scroll.cast'){
    result=require('../equipment/scrolls').cast(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='item.cast'){
    result=require('../equipment/chargedItems').cast(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='equipment.dawn'){
    if(c.campaignId&&!context.gmAllowed)fail('Only the campaign GM can record dawn',403);result=require('../equipment/chargedItems').dawn(c,p);
  }else if(['rebuild.preview','rebuild.approve','rebuild.commit'].includes(body.type)){
    result=require('./rebuild').apply(c,body.type,p,context);
  }else if(['milestone.authorize','equipment.award','equipment.sell'].includes(body.type)){
    result=require('./authority').apply(c,summary,body.type,p,{...context,gmAllowed:!c.campaignId||context.gmAllowed,userId:context.userId??String(c.owner??'solo-owner')});
  }else if(body.type==='spells.discover'){
    result=require('./authority').apply(c,summary,body.type,p,{...context,gmAllowed:!c.campaignId||context.gmAllowed,userId:context.userId??String(c.owner??'solo-owner')});
  }else if(['spells.copy','folio.lose','folio.rebuild'].includes(body.type)){
    result=require('../system/rules2024/folioOperations').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),body.type,p,body.operationId);
  }else if(body.type==='tool.check'){
    result=require('../system/rules2024/toolChecks').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='strike.resolve'){
    result=require('../system/rules2024/strikeOperations').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(['inspiration.grant','inspiration.spend','initiative.record','scene.record','action.record','feat.use'].includes(body.type)){
    result=require('../system/rules2024/featOperations').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),body.type,p);
    if(body.type==='initiative.record')require('../system/rules2024/resting').interrupt(c,summary,{at:require('../system/rules2024/clock').now(c.rulesRuntime),reason:'initiative'});
  }else if(['condition.record','temp-health.choose','death-save.roll','concentration.resolve','health.damage'].includes(body.type)){
    result=require('../system/rules2024/vitality').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),body.type,p);
    if(body.type==='health.damage'&&result.bloodPriceLoss)result.bloodPriceLoss.eventId=body.operationId;
    if(body.type==='health.damage'&&result.damage>0)require('../system/rules2024/resting').interrupt(c,summary,{at:require('../system/rules2024/clock').now(c.rulesRuntime),reason:'damage'});
  }else if(body.type==='relentless-rage.resolve'){
    if(Object.keys(p).some(k=>!['total','confirmed'].includes(k))||p.total!==undefined&&(p.confirmed!==true||!Number.isSafeInteger(p.total)||p.total < -100||p.total>200))fail('Choose a server Resolve save or a GM-confirmed total');
    const rolls=p.total===undefined?[require('node:crypto').randomInt(1,21)]:[];
    const total=p.total??rolls[0]+rules.runtime.project(summary,c.rulesRuntime,c).savingThrowModifiers.resolve;
    const dc=c.rulesRuntime.pendingRelentlessRage?.dc;
    require('../system/rules2024/featureOperations').apply(summary,c.rulesRuntime,{type:'relentless-rage',value:total});
    c.rulesRuntime.revision++;result={type:body.type,rolls,total,dc,success:total>=dc};
  }else if(body.type==='time.advance'){
    if(Object.keys(p).some(k=>!['worldTime','confirmed'].includes(k))||p.confirmed!==true)fail('Confirm the new world time');
    require('../system/rules2024/clock').advance(c.rulesRuntime,p.worldTime);c.rulesRuntime.revision++;
  }else if(body.type==='turn.trigger-end'){
    if(Object.keys(p).some(k=>!['turnId','confirmed'].includes(k))||p.confirmed!==true||typeof p.turnId!=='string'||!p.turnId.trim()||p.turnId.length>100)fail('Confirm the triggering turn ended');c.rulesRuntime.effects=c.rulesRuntime.effects.filter(e=>!e.endsAtTriggerTurnEnd||e.turnId!==p.turnId);c.rulesRuntime.revision++;
  }else if(body.type==='movement.record'){
    const state=c.rulesRuntime;if(Object.keys(p).some(k=>!['feet','voluntarySpeed','eventId','confirmed'].includes(k))||p.confirmed!==true||typeof p.voluntarySpeed!=='boolean'||!Number.isSafeInteger(p.feet)||p.feet<1||p.feet>10000||!state.ownerTurn?.open||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Record confirmed movement on your open owner turn');
    if(p.voluntarySpeed&&state.effects.some(e=>e.steadyAim))fail('Steady Aim sets your Speed to zero until this turn ends');const turn=state.ownerTurn;turn.movementEvents??=[];if(turn.movementEvents.includes(p.eventId)||turn.movementEvents.length>=200)fail('Movement event already recorded or turn journal is full');turn.movementEvents.push(p.eventId);turn.movementFeet=(turn.movementFeet??0)+p.feet;if(p.voluntarySpeed)turn.voluntarySpeedFeet=(turn.voluntarySpeedFeet??0)+p.feet;state.revision++;result={type:body.type,movementFeet:turn.movementFeet,voluntarySpeedFeet:turn.voluntarySpeedFeet??0};
  }else if(body.type==='turn.external'){
    const state=c.rulesRuntime;
    if(Object.keys(p).some(k=>!['turnId','confirmed'].includes(k))||p.confirmed!==true||!require('../system/rules2024/castingTurn').validLabel(p.turnId)||!state.inCombat||state.ownerTurn?.open)fail('Confirm an off-turn encounter turn while the owner turn is closed');
    state.externalCastingTurn=p.turnId;
    state.revision++;
  }else if(body.type==='turn.start'||body.type==='turn.end'){
    if(Object.keys(p).some(k=>!['turnId','confirmed','cover'].includes(k))||p.confirmed!==true||!require('../system/rules2024/castingTurn').validLabel(p.turnId)||p.cover!==undefined&&!['none','half','three-quarters','total'].includes(p.cover))fail('Record a confirmed owner turn ID and any end-of-turn cover');
    const state=c.rulesRuntime;
    if(state.pendingRelentlessRage)fail('Resolve Relentless Rage before progressing the turn');
    if(body.type==='turn.start'){
      if(state.ownerTurn?.open||state.ownerTurnHistory?.includes(p.turnId))fail('Finish the current turn and use a new turn ID');
      state.ownerTurn={id:p.turnId,number:(state.ownerTurn?.number??0)+1,open:true};
      delete state.externalCastingTurn;
      state.ownerTurnHistory=[...(state.ownerTurnHistory??[]),p.turnId];
      if(state.inCombat&&summary.features.some(f=>f.id==='path:deadeye:heroic-warrior:10')&&!state.inspiration){state.inspiration=true;state.inspirationSource={source:'path:deadeye:heroic-warrior:10',createdAt:require('../system/rules2024/clock').now(state),turnId:p.turnId};}
      if(summary.paths.gunslinger==='deadeye'&&summary.callingLevels.gunslinger>=18&&state.health.current>0&&state.health.current<=Math.floor(state.health.max/2)){const before=state.health.current;require('../system/rules2024/vitality').heal(state,Math.max(0,5+summary.attributeModifiers.resolve));result.heroicRally=state.health.current-before;}
    }else{
      if(!state.ownerTurn?.open||state.ownerTurn.id!==p.turnId)fail('End the matching active turn');state.ownerTurn.open=false;
      state.effects=state.effects.filter(e=>!e.endsAtRecordedTurnEnd||e.turnId!==p.turnId);
      if(state.pendingStealthCover===state.ownerTurn.number){
        if(!['three-quarters','total'].includes(p.cover))state.conditions=state.conditions.filter(c=>c.conditionId!=='invisible'||c.source!=='hide');
        state.pendingStealthCover=null;
      }
    }
    state.effects=state.effects.filter(e=>!(e.ends===(body.type==='turn.start'?'start-of-next-turn':'end-of-next-turn')&&(e.createdTurn??0)<state.ownerTurn.number));
    require('../system/rules2024/clock').expire(state);state.revision++;
  }else if(body.type==='rage.extend'){
    if(Object.keys(p).some(k=>!['reason','confirmed'].includes(k))||p.confirmed!==true||!['attack-roll','forced-save','bonus-action'].includes(p.reason)||!c.rulesRuntime.ownerTurn?.open)fail('Confirm an eligible Rage extension on your active turn');
    const rage=c.rulesRuntime.effects.find(e=>e.rage);
    if(!rage||summary.callingLevels.reaver>=15||require('../system/rules2024/vitality').incapacitated(c.rulesRuntime))fail('No eligible Rage needs extension');
    rage.createdTurn=c.rulesRuntime.ownerTurn.number;c.rulesRuntime.revision++;
  }else if(body.type==='advance'){
    if(c.rulesRuntime.deathSaves?.dead)fail('A dead character cannot advance');
    if(Object.keys(p).some(k=>!['choices','level'].includes(k))||p.level!==summary.totalLevel+1)fail('Advance exactly one level');
    if(c.campaignId){
      const milestone=c.rulesRuntime.milestones?.find(m=>m.level===p.level&&!m.used);
      if(!context.campaignRegistered||!milestone)fail('Campaign advancement requires an unused GM-authorized milestone',403);
      milestone.used=true;milestone.usedAt=Date.now();milestone.usedBy=context.userId;
    }
    const persistence=require('./rules2024');
    const next=rules.advance(c.rulesLedger,{expectedRevision:c.rulesLedger.revision,callingId:c.calling,choices:p.choices},persistence.folioAtSpellGrant(c,summary));
    c.rulesRuntime=persistence.reconcile(c.rulesRuntime,summary,next.summary);
    c.rulesLedger=next.ledger;c.attributes=next.summary.attributes;
  }else if(body.type==='identity.patch'){
    if(Object.keys(p).some(k=>!require('./identity').fields.includes(k)))fail('Only narrative fields may be edited');
    Object.assign(c,require('./identity').validate(p));
  }else if(body.type==='spell.reroll'){
    result=require('../system/rules2024/spellRerolls').apply(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='contingency.trigger'){
    result=require('../system/rules2024/contingency').trigger(c,rules.runtime.project(summary,c.rulesRuntime,c),p);
  }else if(body.type==='spell.cast'){
    require('../system/rules2024/featOperations').action(c.rulesRuntime);
    result=require('../system/rules2024/spellOperations').cast(c,summary,p);
    if(result.slotLevel>0)require('../system/rules2024/resting').interrupt(c,summary,{at:require('../system/rules2024/clock').now(c.rulesRuntime),reason:'non-cantrip-spell'});
  }else if(body.type==='ability.activate'){
    if(['Action','Bonus Action','Reaction','Magic action','Attack action rider'].includes(summary.abilityOptions.find(o=>o.id===p.optionId)?.action))require('../system/rules2024/featOperations').action(c.rulesRuntime);
    result=require('../system/rules2024/abilityOperations').activate(c,rules.runtime.project(summary,c.rulesRuntime,c),p,context);
    if(result.damageOutcome?.damage>0)require('../system/rules2024/resting').interrupt(c,summary,{at:require('../system/rules2024/clock').now(c.rulesRuntime),reason:'damage'});
  }else if(body.type==='silent-keel.end-target'){
    if(Object.keys(p).some(key=>!['effectId','targetId','trigger','confirmed'].includes(key))||p.confirmed!==true||!['attack','spell'].includes(p.trigger)||typeof p.effectId!=='string'||typeof p.targetId!=='string')fail('Confirm a shrouded creature attacked or cast a spell');
    const effect=c.rulesRuntime.effects.find(e=>e.id===p.effectId&&e.featureId===silentKeelId&&e.mode==='creatures'&&e.targetIds?.includes(p.targetId));
    if(!effect)fail('Choose a creature still covered by your active Silent Keel');
    removeShroudedTarget(c.rulesRuntime,effect,p.targetId);
    c.rulesRuntime.revision++;
    result={...result,effectId:p.effectId,targetId:p.targetId,trigger:p.trigger,remainingTargets:[...effect.targetIds]};
  }else if(body.type==='effect.end'){
    if(c.rulesRuntime.effects.some(e=>e.uncancelable&&(e.id===p.effectId||e.featureId===p.featureId)))fail('This effect must finish its printed duration');
    if(p.effectId!==undefined){
      if(Object.keys(p).some(k=>k!=='effectId')||typeof p.effectId!=='string'||!c.rulesRuntime.effects.some(e=>e.id===p.effectId))fail('Choose an owned effect');
      c.rulesRuntime.effects=c.rulesRuntime.effects.filter(e=>e.id!==p.effectId);c.rulesRuntime.revision++;
    }else c.rulesRuntime=rules.runtime.update(summary,c.rulesRuntime,{expectedRevision:c.rulesRuntime.revision,type:'end-effect',...p});
  }else if(body.type==='object.damage'){
    if(Object.keys(p).some(k=>!['effectId','amount','damageType','siege'].includes(k))||!Number.isSafeInteger(p.amount)||p.amount<0||p.amount>100000||!['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'].includes(p.damageType)||p.siege!==undefined&&typeof p.siege!=='boolean')fail('Invalid object damage');
    const object=c.rulesRuntime.effects.find(e=>e.id===p.effectId&&['relay','barrier'].includes(e.objectType)&&require('../system/rules2024/clock').active(c.rulesRuntime,e));
    if(!object)fail('Choose a live owned object');
    let damage=p.amount;
    if(['poison','psychic'].includes(p.damageType))damage=0;
    else if(object.objectType==='barrier'&&summary.callingLevels.shipwright>=14&&p.damageType!=='force'&&!p.siege)damage=Math.floor(damage/2);
    object.health.current=Math.max(0,object.health.current-damage);
    if(object.health.current===0)c.rulesRuntime.effects=c.rulesRuntime.effects.filter(e=>e.id!==object.id);
    c.rulesRuntime.revision++;result={type:body.type,damage,remainingHealth:object.health.current};
  }else if(body.type==='resource.adjust'){
    if(!['spend-pool','spend-slot','initiative-recovery'].includes(p.type))fail('Choose a registered manual expenditure or Initiative recovery');
    const combatId=c.rulesRuntime.initiative?.combatId,key=combatId+':'+p.poolId;
    if(p.type==='initiative-recovery'&&(!c.rulesRuntime.inCombat||!combatId||c.rulesRuntime.counters.initiativeRecoveries?.includes(key)))fail('Initiative recovery requires a saved combat Initiative and can resolve only once for this pool in that combat');
    c.rulesRuntime=rules.runtime.update(summary,c.rulesRuntime,{expectedRevision:c.rulesRuntime.revision,...p});
    if(p.type==='initiative-recovery'){c.rulesRuntime.counters.initiativeRecoveries??=[];c.rulesRuntime.counters.initiativeRecoveries.push(key);}
  }else if(body.type==='resource.convert'){
    if(!['slot-to-sorcery','sorcery-to-slot','restore-feature'].includes(p.type))fail('Choose a registered conversion');
    c.rulesRuntime=rules.runtime.update(summary,c.rulesRuntime,{expectedRevision:c.rulesRuntime.revision,...p});
  }else if(body.type==='craft.spend-salvage'){
    if(Object.keys(p).some(k=>!['amountCp','projectId','kind','confirmed'].includes(k))||summary.paths.shipwright!=='drydock-ghost'||summary.callingLevels.shipwright<6||!Number.isSafeInteger(p.amountCp)||p.amountCp<1||p.amountCp>(c.rulesRuntime.salvageCp??0)||!['repair','craft'].includes(p.kind)||typeof p.projectId!=='string'||!p.projectId.trim()||p.projectId.length>100||p.confirmed!==true)fail('Spend available salvage only on an identified, GM-confirmed repair or crafting project');
    c.rulesRuntime.salvageCp-=p.amountCp;c.rulesRuntime.revision++;result={type:body.type,spentCp:p.amountCp,projectId:p.projectId,kind:p.kind};
  }else if(['rest.start','rest.cancel','rest.interrupt','rest.complete'].includes(body.type)){
    result=require('../system/rules2024/resting').apply(c,summary,body.type,p);
  }else if(body.type==='health.apply'){
    if(Object.keys(p).some(k=>!['healthDelta'].includes(k)))fail('Invalid Health tracking fields');
    if(!Number.isSafeInteger(p.healthDelta)||p.healthDelta<0)fail('Use the typed damage operation for damage');
    c.rulesRuntime=rules.runtime.update(summary,c.rulesRuntime,{expectedRevision:c.rulesRuntime.revision,type:'health',...p});
  }else if(body.type==='equipment.equip'){
    if(Object.keys(p).some(k=>!['loadout'].includes(k)))fail('Invalid equipment fields');
    Object.assign(c,require('../equipment').update(c,{expectedRevision:c.documentRevision,...p}));
  }else if(['equipment.buy','equipment.fire','equipment.consume','equipment.split','equipment.merge','equipment.preset.save','equipment.preset.apply'].includes(body.type)){
    result=require('../equipment/commands').apply(c,body.type,p);
  }else fail('Unsupported character command: '+body.type);
    if(body.type.startsWith('equipment.')){
      require('../system/rules2024/covenantOperations').prune(c);
      const armor=c.inventory.find(i=>i.instanceId===c.loadout.armor);
      if(armor&&require('../equipment').definition(armor.definitionId).category==='heavy'){
        c.rulesRuntime.effects=c.rulesRuntime.effects.filter(e=>e.featureId!=='calling:reaver:rage:1');c.rulesRuntime.pendingRelentlessRage=null;
      }
    }
  if(['attack.record','strike.resolve','spell.cast','item.cast'].includes(body.type)||body.type==='scroll.cast'&&result.castId){
    const self=String(c._id??'self');
    const shroud=c.rulesRuntime.effects.find(e=>e.featureId===silentKeelId&&e.mode==='creatures'&&e.targetIds?.includes(self));
    if(shroud)removeShroudedTarget(c.rulesRuntime,shroud,self);
  }
  c.documentRevision++;
  require('../system/rules2024/contingency').prune(c);
  rules.runtime.validate(rules.replay(c.rulesLedger),c.rulesRuntime);
  require('../equipment/magic').validate(c,rules.replay(c.rulesLedger));
  c.rulesRuntime.effects=c.rulesRuntime.effects.filter(e=>!e.sacredWeaponId||c.inventory.some(i=>i.instanceId===e.sacredWeaponId));
  const changes=Object.fromEntries([...require('./identity').fields,'origin','calling','attributes','rulesLedger','rulesRuntime','inventory','loadout','presets','goldCp','documentRevision'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
  return {changes,result};
}
function handler(Character,Receipt,Treatment,Campaign){return async(req,res,next)=>{
  let session;
  try{
    const digest=validateEnvelope(req.body);
    if(Treatment)await Treatment.init();
    session=await Character.db.startSession();let response;
    await session.withTransaction(async()=>{
      let c=await Character.findOne({_id:req.params.characterId,owner:req.user._id}).session(session).lean();
      if(!c&&require('./authority').gmCommands.includes(req.body.type))c=await Character.findOne({_id:req.params.characterId}).session(session).lean();
      if(!c)fail('Character not found',404);
      const authorization=await require('./authority').context(c,req.user._id,Campaign,session);
      if(!authorization.isOwner&&!authorization.gmAllowed)fail('Character not found',404);
      if(require('./authority').gmCommands.includes(req.body.type)&&!authorization.gmAllowed)fail('This operation requires the campaign GM',403);
      const key={characterId:req.params.characterId,owner:c.owner,operationId:req.body.operationId};
      const previous=await Receipt.findOne(key).session(session).lean();
      if(previous){if(previous.digest!==digest)fail('operationId was already used for a different command',409,{code:'operation_conflict',fieldPath:'operationId'});response=previous.response;return;}
      if(c.rulesVersion!=='SA-CHAR-1'||!c.rulesLedger?.creation)fail('Recreate this experimental character using the current creator',409);
      const payload=structuredClone(req.body.payload);
      const context={...authorization};
      if(req.body.type==='ability.activate'&&payload.optionId==='path:sanguine-conduit:vital-circuit:14#circuit'){
        const params=payload.parameters??{};
        if(typeof params.eventId!=='string'||typeof params.targetId!=='string'||typeof payload.turnId!=='string')fail('Vital Circuit needs a damage event, source target and turn');
        const prior=await Receipt.findOne({characterId:c._id,owner:req.user._id,$or:[{'response.operationResult.conduitCircuit.turnId':payload.turnId},{'response.operationResult.conduitCircuit.eventId':params.eventId,'response.operationResult.conduitCircuit.targetId':params.targetId}]}).session(session).lean();
        if(prior)fail('Vital Circuit already resolved this damage event or turn');
        if(!/^[a-f0-9]{24}$/i.test(params.targetId)){
          if(typeof params.objectId!=='string'||!params.objectId.trim()||params.objectId.length>100)fail('Identify your Blood Price grant');
          const grant=await Receipt.findOne({characterId:c._id,owner:req.user._id,'response.operationResult.temporaryHealthGrant.metadata.grantId':params.objectId}).session(session).lean();
          context.bloodPriceGrant=grant?.response?.operationResult?.temporaryHealthGrant;
        }
      }
      if(req.body.type==='ability.activate'&&payload.optionId==='path:sanguine-conduit:vital-circuit:14#circuit'&&/^[a-f0-9]{24}$/i.test(payload.parameters?.targetId??'')){
        const permission=c.campaignId?{$or:[{owner:req.user._id},{campaignId:c.campaignId}]}:{owner:req.user._id};
        const target=await Character.findOne({_id:payload.parameters.targetId,...permission}).session(session).lean();
        if(!target)fail('Vital Circuit source target is not authorized',404);
        const event=await Receipt.findOne({characterId:target._id,owner:target.owner,operationId:payload.parameters.eventId}).session(session).lean();
        if(event?.response?.operationResult?.type!=='health.damage')fail('Choose a saved damage command that reduced Blood Price temporary Health');
        context.bloodPriceLoss=event.response.operationResult.bloodPriceLoss;
      }
      const triage=req.body.type==='ability.activate'&&['path:field-surgeon:clinical-doctrine:3#triage','path:field-surgeon:battlefield-procedure:6#toxicology'].includes(payload.optionId);
      if(triage&&Treatment){
        const target=payload.targetIds?.[0];let restEpoch=payload.parameters?.targetRestEpoch;
        if(typeof target==='string'&&/^[a-f0-9]{24}$/i.test(target)){
          const permission=c.campaignId?{$or:[{owner:req.user._id},{campaignId:c.campaignId}]}:{owner:req.user._id};
          const native=await Character.findOne({_id:target,...permission}).session(session).lean();
          if(!native)fail('Target is not an authorized character',404);
          restEpoch=native.rulesRuntime.restEpoch??'creation';
          payload.parameters={...payload.parameters,targetRestEpoch:restEpoch};
        }
        if(typeof target!=='string'||typeof restEpoch!=='string'||!restEpoch.trim()||restEpoch.length>100)fail('Triage needs one stable target and a completed-rest label');
        const lock={scope:c.campaignId?'campaign:'+c.campaignId:'owner:'+c.owner,target,restEpoch};
        if(await Treatment.findOne(lock).session(session).lean())fail('Target already received Triage since its last rest');
        await Treatment.create([{...lock,sourceCharacterId:c._id,operationId:req.body.operationId}],{session});
      }
      const {changes,result}=apply(c,{...req.body,payload},context);
      if(result.swap&&/^[a-f0-9]{24}$/i.test(result.swap.targetId)){
        if(result.swap.targetId===String(c._id))fail('Alert needs another creature');
        const permission=c.campaignId?{$or:[{owner:req.user._id},{campaignId:c.campaignId}]}:{owner:req.user._id};
        const target=await Character.findOne({_id:result.swap.targetId,...permission}).session(session).lean();
        if(!target)fail('Initiative ally is not an authorized character',404);
        const after=structuredClone(target.rulesRuntime);
        if(require('../system/rules2024/vitality').incapacitated(after)||after.initiative?.combatId!==result.swap.combatId||after.initiative.total!==result.swap.ownerReceives)fail('Ally must be conscious in the same combat with the matching saved Initiative');
        after.initiative.total=result.swap.allyReceives;after.revision++;
        const savedTarget=await Character.findOneAndUpdate({_id:target._id,documentRevision:target.documentRevision},{$set:{rulesRuntime:after,documentRevision:target.documentRevision+1}},{new:true,runValidators:true,session}).lean();
        if(!savedTarget)fail('Initiative ally changed; reload before swapping',409);
      }
      if(['ability.activate','feat.use','equipment.utilize','spell.heal'].includes(req.body.type)&&(result.saveAdvantageEffect||result.healing>0||result.healingAllocations||result.restoreAllHealth||result.temporaryHealthGrant||result.restoresHealthTo!==undefined||result.stabilize||result.endsCondition||result.endsConditions)){
        for(const targetId of payload.targetIds??[]){
          if(targetId===String(c._id)||!/^[a-f0-9]{24}$/i.test(targetId))continue;
          const permission=c.campaignId?{$or:[{owner:req.user._id},{campaignId:c.campaignId}]}:{owner:req.user._id};
          const target=await Character.findOne({_id:targetId,...permission}).session(session).lean();
          if(!target)fail('Target is not an authorized character',404);
          const after=structuredClone(target.rulesRuntime);
          require('../system/rules2024/vitality').targetEffects(after,result.healingAllocations?{...result,healing:result.healingAllocations.find(a=>a.targetId===targetId)?.amount??0}:result,rules.replay(target.rulesLedger));
          if(result.temporaryHealthGrant?.targetIds.includes(targetId)&&result.temporaryHealthGrant.amount>after.temporaryHealth){after.temporaryHealth=result.temporaryHealthGrant.amount;after.temporaryHealthMetadata=result.temporaryHealthGrant.metadata??{source:result.optionId};}
          after.revision++;
          rules.runtime.validate(rules.replay(target.rulesLedger),after);
          const savedTarget=await Character.findOneAndUpdate({_id:target._id,documentRevision:target.documentRevision},{$set:{rulesRuntime:after,documentRevision:target.documentRevision+1}},{new:true,runValidators:true,session}).lean();
          if(!savedTarget)fail('Target changed; retry healing',409);
        }
      }
      const saved=await Character.findOneAndUpdate({_id:c._id,owner:c.owner,documentRevision:c.documentRevision},{$set:changes},{new:true,runValidators:true,session}).lean();
      if(!saved)fail('Character changed; reload before saving',409);
      response={...require('./rules2024').decorate(saved),permissions:require('./authority').permissions(saved,authorization),operationResult:result};
      await Receipt.create([{...key,actor:req.user._id,actorRole:authorization.role,digest,response}],{session});
    });
    res.send(response);
  }catch(error){const failure=error.code===11000&&error.keyPattern?.restEpoch?Object.assign(new Error('Target already received Triage since its last rest'),{statusCode:422}):error;next(failure);}finally{if(session)await session.endSession();}
};}
module.exports={apply,handler,validateEnvelope};
