const {randomInt}=require('node:crypto');
const clock=require('./clock');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,s,o,p,targets,effect,result,turnId){
  if(p.confirmed!==true)fail('Confirm the Navigator trigger, willingness, sight, range and supporting destinations');
  const state=c.rulesRuntime,level=s.callingLevels.navigator,self=String(c._id??'self');
  const ownTurn=()=>{if(!state.ownerTurn?.open||state.ownerTurn.id!==turnId)fail('This option requires your current open owner turn');};
  const event=()=>{if(typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Record a stable trigger event ID');};
  const once=key=>{event();state.counters[key]??=[];if(state.counters[key].some(e=>e.turnId===turnId||e.eventId===p.eventId)||state.counters[key].length>=200)fail('This rider already resolved this turn or its event journal is full');state.counters[key].push({turnId,eventId:p.eventId});};
  const weapon=()=>{if(targets.length!==1||!require('../../equipment').derive(c).attacks.some(a=>a.instanceId===p.objectId&&!a.requiresTwoHandGrip))fail('Confirm one target hit by an equipped weapon');};
  const hide=()=>{
    if(p.mode!=='cover'&&p.mode!=='heavy-obscurement')fail('Hiding requires cover or heavy obscurement');
    const check=require('./agilityChecks').hide(c,s);
    Object.assign(result,{hideRoll:check.naturalRoll,hideRolls:check.rolls,hideTotal:check.checkTotal,hideDC:check.dc,hidden:check.success});
  };
  const mark=()=>{if(targets.length!==1||!state.effects.some(e=>e.featureId==='spell:hunter-s-mark'&&clock.active(state,e)&&(e.targets??[]).includes(targets[0])))fail('Choose the target of your active Hunters Mark');};
  switch(o.handler){
    case 'starwake-guide':
      if(!targets.length||targets.length>2||targets.includes(self))fail('Guide one or two other willing allies within thirty feet');
      effect.concentration=true;effect.expiresAt=effect.createdAt+60000;effect.passage={speedType:s.pathSelections.navigator.pathDiscipline==='cliff'?'climb':'swim',speedFeet:level>=7?30:20,ignoreNonmagicalDifficultTerrain:level>=7,extraMovement:false};result.passage=effect.passage;break;
    case 'starwake-hit':{
      ownTurn();weapon();const passage=state.effects.find(e=>e.passage&&clock.active(state,e));
      if(!passage||(p.advantageTargets??[]).length!==1||!passage.targetIds.includes(p.advantageTargets[0]))fail('Confirm a currently guided ally within five feet of this target on your first weapon hit');
      once('starwakeHits');result.rolls=[randomInt(1,o.preview.roll.sides+1)];result.damage=result.rolls[0];result.recordOnly=true;break;
    }
    case 'starwake-home':
      if(targets.length>2||targets.includes(self)||!Array.isArray(p.areas)||p.areas.length!==targets.length+1||p.areas.some(x=>typeof x!=='string'||!x.trim()||x.length>100)||new Set(p.areas).size!==p.areas.length)fail('Record distinct visible supporting destinations within sixty feet for yourself and up to two nearby willing creatures');
      state.effects=state.effects.filter(e=>!e.passage);result.teleport={targetIds:[self,...targets],destinations:p.areas,maximumFeet:60,provokesOpportunityAttacks:false};result.recordOnly=true;break;
    case 'mangrove-hit':{
      weapon();mark();if(typeof turnId!=='string'||!turnId.trim()||turnId.length>100)fail('Record the triggering turn');once('mangroveHits');
      const {count,sides}=o.preview.roll;
      result.rolls=Array.from({length:count},()=>randomInt(1,sides+1));result.damage=result.rolls.reduce((a,b)=>a+b,0);result.damageType='piercing';
      if(o.preview.save){result.save={...o.preview.save};effect.snare={speedFeet:0,save:result.save};effect.ends='start-of-next-turn';}else{hide();result.recordOnly=true;}break;
    }
    case 'mangrove-predator':
      ownTurn();mark();if(p.mode!=='started-hidden-in-cover')fail('Confirm you started this turn Hidden from your marked target and remain in cover');once('mangroveMovement');result.movement={feet:10,endsHiddenOnLeavingCover:true,extraMovement:false};result.recordOnly=true;break;
    case 'mangrove-vanish':
      event();if(targets.length!==1||!Number.isSafeInteger(p.incomingDamage)||p.incomingDamage<1||p.incomingDamage>1000000)fail('Confirm one visible attacker hit and its unresolved incoming damage');
      state.counters.mangroveVanish??=[];if(state.counters.mangroveVanish.includes(p.eventId)||state.counters.mangroveVanish.length>=200)fail('This incoming hit already resolved or the event journal is full');state.counters.mangroveVanish.push(p.eventId);result.remainingDamage=Math.floor(p.incomingDamage/2);result.movement={feet:10,provokesOpportunityAttacks:true};if(p.mode==='cover'||p.mode==='heavy-obscurement')hide();result.recordOnly=true;break;
    default:fail('Unknown Navigator operation');
  }
}
module.exports={apply};
