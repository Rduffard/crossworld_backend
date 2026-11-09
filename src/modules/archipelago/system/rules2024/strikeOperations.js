const {randomInt,randomUUID}=require('node:crypto');
const turns=require('./castingTurn');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
const sizes=['tiny','small','medium','large','huge','gargantuan'];
const cunning=[
  {id:'poison',level:5,cost:1,save:'resolve',condition:'poisoned',durationSeconds:60,repeatSave:'end-of-target-turn'},
  {id:'trip',level:5,cost:1,save:'agility',condition:'prone'},
  {id:'withdraw',level:5,cost:1,halfSpeedMovement:true,noOpportunityAttacks:true},
  {id:'stealth-attack',level:9,cost:1,path:'reef-knife',preservesHide:true},
  {id:'daze',level:14,cost:2,save:'resolve',targetTurnRestriction:'Choose movement, one Action or one Bonus Action on the next turn'},
  {id:'knock-out',level:14,cost:6,save:'resolve',condition:'unconscious',durationSeconds:60,repeatSave:'end-of-target-turn',endsOnTargetDamage:true},
  {id:'obscure',level:14,cost:3,save:'agility',condition:'blinded',ends:'end-of-target-next-turn'},
];
const brutal=[
  {id:'forceful-blow',level:9,pushFeet:15,halfSpeedMovement:true,noOpportunityAttacks:true,movementDirection:'straight toward the target'},
  {id:'hamstring-blow',level:9,speedReductionFeet:15,ends:'start-of-next-turn',stacking:'replace previous Hamstring Blow'},
  {id:'staggering-blow',level:13,nextSaveDisadvantage:true,noOpportunityAttacks:true,ends:'start-of-next-turn'},
  {id:'sundering-blow',level:13,nextOtherCreatureAttackBonus:5,ends:'start-of-next-turn',stacking:'one Sundering bonus per attack'},
];
function available(summary,kind){const level=summary.callingLevels[kind==='cunning'?'corsair':'reaver']??0;return (kind==='cunning'?cunning:brutal).filter(o=>level>=o.level&&(!o.path||summary.paths.corsair===o.path));}
function apply(c,summary,p){
  if(!p||Object.keys(p).some(k=>!['kind','options','weaponId','targetId','targetSize','turnId','eventId','confirmed','critical','reckless','disadvantage','hit'].includes(k))||!['cunning','brutal'].includes(p.kind)||p.confirmed!==true||p.hit!==undefined&&typeof p.hit!=='boolean')fail('Confirm an eligible hit and the strike type');
  for(const key of ['targetId','eventId'])if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>100)fail('Record stable target and hit IDs');
  if(p.critical!==undefined&&typeof p.critical!=='boolean'||p.disadvantage!==undefined&&typeof p.disadvantage!=='boolean')fail('Choose valid attack roll flags');
  if(require('./vitality').incapacitated(c.rulesRuntime))fail('Cannot make a strike while Incapacitated');
  const level=summary.callingLevels[p.kind==='cunning'?'corsair':'reaver']??0;if(level<(p.kind==='cunning'?1:9))fail('Strike feature is not acquired');
  const choices=available(summary,p.kind);if(!Array.isArray(p.options)||new Set(p.options).size!==p.options.length||p.options.some(id=>!choices.some(o=>o.id===id))||p.options.length>(p.kind==='cunning'?level>=11?2:1:level>=17?2:1))fail('Choose distinct available strike options within the feature limit');
  const options=p.options.map(id=>choices.find(o=>o.id===id)),state=c.rulesRuntime,gear=require('../../equipment').derive(c),attack=gear.attacks.find(a=>a.instanceId===p.weaponId);
  const savedTurn=turns.current(state);
  if(savedTurn&&p.turnId!==undefined&&p.turnId!==savedTurn||state.inCombat&&!savedTurn)fail('Use the current recorded encounter turn for this strike');
  const turnId=savedTurn??(turns.validLabel(p.turnId)?p.turnId.trim():null);
  if(!turns.validLabel(turnId))fail('Record a stable strike turn ID');
  if(p.weaponId!==undefined&&!attack||attack?.requiresTwoHandGrip)fail('Choose a wielded weapon with its required grip');
  state.strikeHistory??=[];if(state.strikeHistory.some(r=>r.eventId===p.eventId||r.kind===p.kind&&r.turnId===turnId))fail('This strike has already been used on the recorded turn');
  if(state.strikeHistory.length>=200)fail('Too many saved strike events; complete a rest');
  if(p.kind==='cunning'&&state.forbiddenSneakEvents?.includes(p.eventId))fail('This Answer in Steel attack cannot deal Sneak Attack damage');
  let diceCount,damageType,cost=0;
  if(p.kind==='cunning'){
    if(p.hit===false)fail('Sneak Attack damage requires a hit');
    if(!attack||attack.weapon.type!=='ranged'&&!attack.weapon.properties.some(v=>v.id==='finesse')||p.disadvantage===true)fail('Sneak Attack requires an eligible Finesse or Ranged weapon and no Disadvantage; confirm its other trigger conditions');
    cost=options.reduce((s,o)=>s+o.cost,0);diceCount=summary.mechanics.corsair.sneakAttackDice-cost;if(diceCount<0)fail('Cunning Strike costs exceed Sneak Attack dice');
    if(p.options.includes('poison')&&!c.inventory.some(i=>i.definitionId==='poisoner-kit'))fail('Poison requires a carried Poisoner kit');
    if(p.options.includes('trip')&&(!sizes.includes(p.targetSize)||sizes.indexOf(p.targetSize)>3))fail('Trip requires a confirmed Large-or-smaller target');
    if(p.options.includes('stealth-attack')&&(!state.ownerTurn?.open||!state.conditions.some(v=>v.conditionId==='invisible'&&v.source==='hide')))fail('Stealth Attack requires your active turn and the Hide source of Invisible');
    damageType=attack.weapon.damage.type;
  }else{
    if(!state.ownerTurn?.open||p.reckless!==true||p.disadvantage===true||attack&&(!attack.allowedAttributes.includes('might')||attack.heavyDisadvantage))fail('Brutal Strike requires your own turn, Reckless Attack, a Might-based attack and no Disadvantage; forgo all Advantage');
    if(!state.effects.some(e=>e.recklessAttack)){
      if(state.ownerTurn.attackEvents?.length)fail('Reckless Attack must be chosen on the first attack roll of your turn');
      state.effects.push({id:randomUUID(),featureId:'calling:reaver:reckless-attack:2',recklessAttack:true,createdTurn:state.ownerTurn.number,ends:'start-of-next-turn',createdAt:require('./clock').now(state)});
    }
    diceCount=level>=17?2:1;damageType=attack?.weapon.damage.type??'bludgeoning';
  }
  const rolls=Array.from({length:p.hit===false?0:diceCount*(p.critical?2:1)},()=>randomInt(1,p.kind==='cunning'?7:11));
  const createdAt=require('./clock').now(state);
  const effects=(p.hit===false?[]:options).map(o=>({featureId:p.kind==='cunning'?'calling:corsair:cunning-strike:5':'calling:reaver:brutal-strike:9',name:o.id,targetIds:[p.targetId],createdAt,createdTurn:state.ownerTurn?.number??0,...structuredClone(o),optionId:o.id,id:randomUUID(),
    ...(o.save?{save:{attribute:o.save,dc:8+summary.trainingBonus+summary.attributeModifiers.agility}}:{}),
    ...(o.durationSeconds?{expiresAt:createdAt+o.durationSeconds*1000}:{}),
    ...(o.halfSpeedMovement?{movementFeet:Math.floor(Math.max(0,summary.movement.walk)/2)}:{}),
  }));
  // These are target resolutions, not conditions imposed on the attacking owner.
  for(const e of effects)if(e.condition){e.targetCondition=e.condition;delete e.condition;}
  require('./featOperations').action(state);
  if(p.kind==='brutal'){
    const rage=state.effects.find(e=>e.rage&&require('./clock').active(state,e));if(rage)rage.createdTurn=state.ownerTurn.number;
  }
  if(p.options.includes('stealth-attack'))state.pendingStealthCover=state.ownerTurn.number;
  else state.conditions=state.conditions.filter(v=>v.conditionId!=='invisible'||v.source!=='hide');
  state.effects.push(...effects);const result={type:'strike.resolve',kind:p.kind,eventId:p.eventId,turnId,targetId:p.targetId,costDice:cost,damageDice:diceCount,studyEffectId:state.effects.find(e=>e.studyTargetId===p.targetId&&require('./clock').active(state,e))?.id??null,rolls,extraDamage:rolls.reduce((a,b)=>a+b,0),damageType,effects,hit:p.hit!==false,forgoAllAdvantage:p.kind==='brutal'};
  state.strikeHistory.push(result);state.revision++;require('./runtime').validateProjected(summary,state);return result;
}
module.exports={apply,available};
