const {randomInt}=require('node:crypto');
function spend(state,level,recall,roll=()=>randomInt(1,5)){
  if(!Number.isSafeInteger(level)||level<1||level>state.slots.length||state.slots[level-1]<1)throw Object.assign(new Error('Choose an available spell slot'),{statusCode:422});
  const recallRoll=recall&&level<=4?roll():null,spentSlot=recallRoll!==level;
  if(spentSlot){state.slots[level-1]--;if(state.createdSlots[level-1])state.createdSlots[level-1]--;}
  return {spentSlot,...(recallRoll!==null?{spellRecall:{roll:recallRoll,slotLevel:level,preserved:!spentSlot}}:{})};
}
module.exports={spend};
