function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function validate(character,spell,management,callingId,focusId){
  const gear=require('../../equipment'),held=['mainHand','offHand'].map(s=>character.loadout[s]).filter(Boolean),freeHands=character.loadout.grip==='two'?0:2-held.length;
  if(management.components.includes('V')&&character.rulesRuntime.effects.some(e=>e.speechBlocked&&require('./clock').active(character.rulesRuntime,e)))fail('Verbal components require speech');
  let focus=null;
  if(focusId!==undefined){
    focus=character.inventory.find(i=>i.instanceId===focusId);
    if(!focus?.definitionId)fail('Choose an owned catalog focus or component pouch');
  }
  if(!management.components.includes('M')){
    if(focusId!==undefined)fail('This casting has no Material component');
    if(management.components.includes('S')&&freeHands<1)fail('Somatic components require a free hand');
    return {freeHands,focusId:null};
  }
  const type={doctor:'holy',warden:'holy',navigator:'druidic',tidecaller:'arcane',shipwright:'arcane'}[callingId];
  const usable=item=>{const d=item.definitionId?gear.definition(item.definitionId):null;return d&&(d.focus==='component-pouch'||d.focus===type);};
  if(focus&&!usable(focus))fail('This focus cannot serve the spell source');
  // Printed priced or consumed components are validated and consumed separately.
  if(spell.specificMaterial||management.consumedMaterial){
    if(freeHands<1)fail('Handling priced or consumed Material components requires a free hand');
    return {freeHands,focusId:null,actualMaterial:true};
  }
  focus??=character.inventory.find(usable);if(!focus)fail('Material components require a proper focus or component pouch');
  const d=gear.definition(focus.definitionId),heldFocus=held.includes(focus.instanceId),wornHoly=d.id==='holy-symbol'||d.id==='holy-symbol-emblem';
  if(!heldFocus&&!wornHoly&&freeHands<1)fail('Holding a focus or using a component pouch requires a free hand');
  if(management.components.includes('S')&&freeHands<1&&!heldFocus)fail('Somatic components require a free hand or the hand holding the Material focus');
  return {freeHands,focusId:focus.instanceId};
}
module.exports={validate};
