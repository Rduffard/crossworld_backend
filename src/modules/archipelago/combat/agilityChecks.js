const {randomInt}=require('node:crypto');
const {agilitySkillRules,selectD20,applyRollFloors,hideOutcome}=require('@crossworld/sanguine-engine/dice');

function rollSkill(character,summary,skillId,{toolId,rollD20=()=>randomInt(1,21)}={}){
  const restrictions=require('../equipment/equipmentView').derive(character).restrictions;
  const {advantage,disadvantage,rollCount,minimumNatural,modifier}=agilitySkillRules(summary,restrictions,skillId,toolId);
  const rolls=Array.from({length:rollCount},rollD20);
  const naturalRoll=selectD20(rolls,advantage,disadvantage);
  const {applied:appliedRoll,total:checkTotal}=applyRollFloors(naturalRoll,modifier,minimumNatural,-Infinity);
  return {rolls,naturalRoll,appliedRoll,checkTotal,advantage,disadvantage};
}

function hide(character,summary){
  const check=rollSkill(character,summary,'stealth');
  const {dc,success}=hideOutcome(check.checkTotal);
  if(success){
    const state=character.rulesRuntime;
    state.conditions=state.conditions.filter(c=>c.conditionId!=='invisible'||c.source!=='hide');
    state.conditions.push({conditionId:'invisible',source:'hide'});
    state.hideCheckTotal=check.checkTotal;
  }
  return {...check,dc,success};
}

module.exports={rollSkill,hide};
