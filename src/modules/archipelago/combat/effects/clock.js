const { clearTemporaryHealth } = require('@crossworld/sanguine-engine/vitality');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
const { now, active } = require('./effectTime');
const { incapacitated, revive } = require('../vitality/healthState');
function expire(state){
  state.effects=(state.effects??[]).filter(e=>active(state,e)&&!(e.endsOnCasterIncapacitated&&incapacitated(state)));
  if(!state.effects.some(e=>e.rage||e.featureId==='calling:reaver:rage:1'))state.pendingRelentlessRage=null;
  if(state.health?.current===0&&state.deathSaves?.stable&&!state.deathSaves.dead&&state.deathSaves.stableUntil<=now(state))revive(state,1);
  if(state.temporaryHealthMetadata?.expiresAt!==undefined&&state.temporaryHealthMetadata.expiresAt<=now(state)){
    Object.assign(state, clearTemporaryHealth());
  }
  const concentration=new Set(state.effects.filter(e=>e.concentration).map(e=>e.id));
  state.concentrationChecks=(state.concentrationChecks??[]).filter(c=>c.effects.some(id=>concentration.has(id)));
}
function advance(state,time){
  if(!Number.isSafeInteger(time)||time<0)fail('Choose a valid world time');
  if(state.worldTime!==undefined&&time<state.worldTime)fail('World time cannot move backward');
  // The first GM clock anchors previously created effects to the selected calendar.
  if(state.worldTime===undefined){
    const offset=time-Date.now();
    for(const effect of state.effects??[])for(const key of ['createdAt','expiresAt'])if(effect[key]!==undefined)effect[key]+=offset;
    if(state.temporaryHealthMetadata?.expiresAt!==undefined)state.temporaryHealthMetadata.expiresAt+=offset;
    if(state.deathSaves?.stableUntil!==undefined)state.deathSaves.stableUntil+=offset;
  }
  state.worldTime=time;expire(state);
}
module.exports={now,active,advance,expire};
