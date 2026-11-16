const { resolveCastingComponents } = require('@crossworld/sanguine-engine/spells/components');

function fail(message){throw Object.assign(new Error(message),{statusCode:422});}

function validate(character,spell,management,callingId,focusId){
  const {definition}=require('../equipment/inventory');
  const heldIds=['mainHand','offHand'].map(slot=>character.loadout[slot]).filter(Boolean);
  const speechBlocked=management.components.includes('V')&&character.rulesRuntime.effects.some(effect=>
    effect.speechBlocked&&require('../combat/effects/clock').active(character.rulesRuntime,effect));
  const result=resolveCastingComponents({
    spell,management,callingId,focusId,heldIds,speechBlocked,definition,
    grip:character.loadout.grip,inventory:character.inventory,
  });
  if(result.error)fail(result.error);
  return result;
}

module.exports={validate};
