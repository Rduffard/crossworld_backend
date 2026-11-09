const {randomInt,randomUUID}=require('node:crypto');
const vitality=require('./vitality');
const turns=require('./castingTurn');
const clauses={alert:'initiative-swap','savage-attacker':'weapon-dice',grappler:'punch-and-grab','boon-of-combat-prowess':'peerless-aim','boon-of-dimensional-travel':'blink-steps','boon-of-fate':'improve-fate','boon-of-irresistible-offense':'overwhelming-strike','boon-of-the-night-spirit':'merge-with-shadows','harbor-defender':'intercept','field-responder':'stabilize'};
const options=Object.entries(clauses).map(([featId,clause])=>({featId,clause}));
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function fields(p,allowed){if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.includes(k)))fail('Invalid feat operation fields');}
function label(v){return typeof v==='string'&&v.trim()&&v.length<=100;}
function integer(v,min=-1000,max=1000){return Number.isSafeInteger(v)&&v>=min&&v<=max;}
function action(state){state.effects=state.effects.filter(e=>!e.endsAfterAction);}
function source(c,id){const index=c.rulesLedger.levels.findIndex(e=>e.choices.feat===id);return 'feat:'+id+'@'+(index<0?'background:'+c.rulesLedger.creation.backgroundId:'level:'+(index+1))+':'+clauses[id];}
function recover(state,rest=false){for(const record of Object.values(state.featState??{})){if(record.featId==='boon-of-fate')record.spent=false;if(rest){record.events=[];record.turns=[];}}}
function validate(summary,state){
  if(state.inspiration!==undefined&&typeof state.inspiration!=='boolean'||state.inCombat!==undefined&&typeof state.inCombat!=='boolean')fail('Invalid saved Inspiration or combat state');
  if(state.environment&&!['bright','dim','dark'].includes(state.environment.light))fail('Invalid saved scene light');
  if(state.featState!==undefined&&(!state.featState||typeof state.featState!=='object'||Array.isArray(state.featState)||Object.keys(state.featState).length>22))fail('Invalid saved feat state');
  for(const record of Object.values(state.featState??{})){
    if(!summary.feats.includes(record.featId)||typeof record.spent!=='boolean')fail('Saved feat counter requires its owned feat');
    for(const list of [record.events,record.turns])if(!Array.isArray(list)||list.length>200||new Set(list).size!==list.length||list.some(id=>!label(id)))fail('Invalid saved feat event history');
  }
}
function apply(c,summary,type,p){
  const state=c.rulesRuntime;let result={type};
  if(type==='inspiration.grant'){
    fields(p,['confirmed']);if(p.confirmed!==true)fail('Confirm the GM Inspiration award');if(!state.inspiration)state.inspirationSource={source:'gm-award',createdAt:require('./clock').now(state)};state.inspiration=true;
  }else if(type==='inspiration.spend'){
    fields(p,['sides','originalRoll','eventId','confirmed']);
    if(!state.inspiration)fail('No Heroic Inspiration available');
    if(p.confirmed!==true||![4,6,8,10,12,20,100].includes(p.sides)||!integer(p.originalRoll,1,p.sides)||!label(p.eventId))fail('Confirm the original die, its size and stable roll ID');
    const inspirationSource=state.inspirationSource;state.inspiration=false;state.inspirationSource=null;result={...result,eventId:p.eventId,inspirationSource,originalRoll:p.originalRoll,roll:randomInt(1,p.sides+1),sides:p.sides,mustUseNewRoll:true};
  }else if(type==='initiative.record'){
    fields(p,['combatId','roll','confirmed']);if(p.confirmed!==true||!label(p.combatId)||p.roll!==undefined&&!integer(p.roll,1,20))fail('Confirm combat and a valid Initiative d20');
    if(state.initiative?.combatId===p.combatId)fail('Initiative already recorded for this combat');
    if(vitality.incapacitated(state))fail('Cannot roll Initiative while Incapacitated');
    const rolls=p.roll!==undefined?[p.roll]:Array.from({length:summary.initiative.advantage?2:1},()=>randomInt(1,21)),roll=Math.max(...rolls);state.initiative={combatId:p.combatId,roll,rolls,total:roll+summary.initiative.modifier,...(summary.paths.corsair==='reef-knife'&&summary.callingLevels.corsair>=17?{firstRoundExtraTurnOffset:-10}:{})};state.inCombat=true;
    recover(state);result={...result,...state.initiative};
  }else if(type==='scene.record'){
    fields(p,['light','inCombat','confirmed']);if(p.confirmed!==true||!['bright','dim','dark'].includes(p.light)||typeof p.inCombat!=='boolean')fail('Confirm light and combat state');
    if(!p.inCombat)delete state.externalCastingTurn;
    state.environment={light:p.light};state.inCombat=p.inCombat;if(p.light==='bright')action(state);
  }else if(type==='action.record'){
    fields(p,['action','confirmed']);if(p.confirmed!==true||!['action','bonus-action','reaction'].includes(p.action))fail('Confirm the action used');if(vitality.incapacitated(state))fail('Cannot act while Incapacitated');action(state);
  }else if(type==='feat.use'){
    fields(p,['featId','parameters','targetIds','eventId','turnId','confirmed']);
    if(p.confirmed!==true||!summary.feats.includes(p.featId)||!label(p.eventId))fail('Confirm the known feat trigger and a stable event ID');
    const params=p.parameters??{};fields(params,['weaponId','critical','sign','total','incomingDamage','allyTotal','consent','distanceFeet','naturalRoll','damageType','kitId','trigger','targetSize']);
    const targets=p.targetIds??[];if(!Array.isArray(targets)||targets.length>1||targets.some(id=>!label(id)))fail('Choose at most one stable feat target');
    if(vitality.incapacitated(state))fail('Cannot use this feat while Incapacitated');
    state.featState??={};const grantKey=source(c,p.featId),record=state.featState[grantKey]??={featId:p.featId,events:[],turns:[],spent:false};
    if(record.events.includes(p.eventId))fail('This feat event has already been resolved');
    if(record.events.length>=200)fail('Too many feat events; complete a rest');
    const savedTurn=turns.current(state);
    const turnId=savedTurn??(typeof p.turnId==='string'?p.turnId.trim():null);
    const oncePerTurn=()=>{
      if(savedTurn&&p.turnId!==undefined&&p.turnId!==savedTurn||state.inCombat&&!savedTurn)fail('Use the current recorded encounter turn for this feat');
      if(!turns.validLabel(turnId)||record.turns.some(id=>id===turnId||!savedTurn&&id.trim()===turnId))fail('This feat requires an unused confirmed turn label');
      record.turns.push(turnId);
    };
    result={...result,featId:p.featId,grantKey,eventId:p.eventId};
    switch(p.featId){
      case 'savage-attacker':{
        oncePerTurn();const attack=require('../../equipment').derive(c).attacks.find(a=>a.instanceId===params.weaponId);
        if(!attack||attack.requiresTwoHandGrip||params.critical!==undefined&&typeof params.critical!=='boolean')fail('Choose a wielded weapon usable with the current grip and confirm the hit');
        const {count,sides}=attack.weapon.damage,n=count*(params.critical?2:1);
        const rolls=Array.from({length:2},()=>Array.from({length:n},()=>randomInt(1,sides+1)));
        // Great Weapon Fighting changes ones/twos only for eligible melee dice.
        const great=summary.fightingStyles.includes('great-weapon-fighting')&&attack.weapon.type==='melee'&&c.loadout.grip==='two'&&(attack.weapon.hands===2||attack.weapon.versatileDamage);
        const totals=rolls.map(dice=>dice.reduce((s,n)=>s+(great?Math.max(3,n):n),0));result={...result,rolls,totals,weaponDiceTotal:Math.max(...totals),flatModifier:attack.damageModifier,riderDiceIncluded:false};break;
      }
      case 'alert':{
        if(!state.initiative||targets.length!==1||targets[0]===String(c._id??'self')||params.consent!==true||!integer(params.allyTotal))fail('Record Initiative and confirm one willing conscious ally in the same combat');
        if(record.combatId===state.initiative.combatId)fail('Alert swap already used in this combat');
        result.swap={targetId:targets[0],combatId:state.initiative.combatId,allyReceives:state.initiative.total,ownerReceives:params.allyTotal};state.initiative.total=params.allyTotal;record.combatId=state.initiative.combatId;break;
      }
      case 'boon-of-combat-prowess':{
        const turn=state.ownerTurn?.number??0;if(record.ownerTurn===turn)fail('Peerless Aim already used before your next turn');record.ownerTurn=turn;result.hitInstead=true;result.naturalTwenty=false;break;
      }
      case 'boon-of-dimensional-travel':{
        if(!['attack','magic'].includes(params.trigger)||!integer(params.distanceFeet,0,30))fail('Confirm immediate Attack/Magic action teleport to a visible unoccupied space within 30 feet');action(state);result.teleportFeet=params.distanceFeet;break;
      }
      case 'boon-of-fate':{
        if(record.spent||!['bonus','penalty'].includes(params.sign)||!integer(params.total)||targets.length!==1)fail('Improve Fate requires an available use and a confirmed D20 Test within 60 feet');
        action(state);const rolls=[randomInt(1,5),randomInt(1,5)],adjustment=rolls.reduce((a,b)=>a+b,0)*(params.sign==='bonus'?1:-1);result={...result,rolls,adjustment,total:params.total+adjustment};record.spent=true;break;
      }
      case 'boon-of-irresistible-offense':{
        if(params.naturalRoll!==20||targets.length!==1||!vitality.damageTypes.includes(params.damageType))fail('Confirm a natural twenty attack, its target and original damage type');
        const grant=c.rulesLedger.levels.find(e=>e.choices.feat===p.featId),attribute=Object.keys(grant?.choices.increases??{})[0];if(!attribute)fail('Missing source attribute for this boon');result.extraDamage=summary.attributes[attribute];result.damageType=params.damageType;result.ignoresPhysicalResistance=true;break;
      }
      case 'boon-of-the-night-spirit':{
        if(!['dim','dark'].includes(state.environment?.light))fail('Merge with Shadows requires recorded Dim Light or Darkness');action(state);state.effects.push({id:randomUUID(),featureId:'feat:boon-of-the-night-spirit',name:'Merge with Shadows',condition:'invisible',endsAfterAction:true,createdAt:require('./clock').now(state)});result.invisible=true;break;
      }
      case 'harbor-defender':{
        if(targets.length!==1||!integer(params.incomingDamage,1,1000000))fail('Confirm visible ally within five feet and incoming attack damage before Resistance');action(state);result.damageReduction=Math.min(params.incomingDamage,summary.trainingBonus);result.remainingDamage=params.incomingDamage-result.damageReduction;break;
      }
      case 'field-responder':{
        if(targets.length!==1||targets[0]===String(c._id??'self'))fail('Confirm one other living creature at zero Health within five feet');const kit=c.inventory.find(i=>i.instanceId===params.kitId&&i.definitionId==='healer-kit');if(!kit||!(kit.chargesCurrent>0))fail('Choose an owned healer kit with a charge');action(state);kit.chargesCurrent--;result.stabilize=true;result.requireZeroHealth=true;break;
      }
      case 'grappler':{
        if(!state.ownerTurn?.open||targets.length!==1)fail('Punch and Grab requires your active turn and a confirmed unarmed Attack-action hit');oncePerTurn();action(state);result.grapple={save:['might','agility'],dc:8+summary.trainingBonus+summary.attributeModifiers.might,alsoDamage:true};break;
      }
      default:fail('This feat has no triggered operation; use its passive rules or its dedicated casting controls');
    }
    record.events.push(p.eventId);
  }else fail('Unknown feat operation');
  state.revision++;require('./runtime').validateProjected(summary,state);return result;
}
module.exports={apply,recover,action,source,validate,options};
