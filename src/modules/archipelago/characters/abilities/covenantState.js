const { active } = require('../../combat/effects/effectTime');
const { covenantShieldGuardBonus } = require('@crossworld/sanguine-engine/callings');
const { definition } = require('../../equipment/inventory');

const steel='path:iron-covenant:covenant-of-steel:3',standard='path:iron-covenant:unyielding-standard:20';
function held(character,id){return Boolean(id&&[character.loadout.mainHand,character.loadout.offHand].includes(id)&&character.inventory.some(i=>i.instanceId===id&&i.definitionId&&definition(i.definitionId).kind==='shield'));}
function guardBonus(character){
  const bulwarkActive=character.rulesRuntime?.effects.some(e=>e.featureId===steel&&e.shieldDiscipline==='bulwark'&&active(character.rulesRuntime,e)&&held(character,e.shieldInstanceId));
  return covenantShieldGuardBonus(bulwarkActive);
}

module.exports = { steel, standard, held, guardBonus };
