const {randomInt}=require('node:crypto');

function rollSkill(character,summary,skillId,{toolId,rollD20=()=>randomInt(1,21)}={}){
  const restrictions=require('../../equipment').derive(character).restrictions;
  const trainedSkill=summary.training.includes(skillId);
  const trainedTool=toolId!==undefined&&summary.equipmentTraining.tools.includes(toolId);
  const stealth=skillId==='stealth';
  const advantage=Boolean(stealth&&summary.silentKeelStealth||trainedSkill&&trainedTool);
  const disadvantage=Boolean(summary.conditions?.includes('poisoned')||restrictions.physicalD20Disadvantage||stealth&&restrictions.stealthDisadvantage);
  const rolls=Array.from({length:advantage===disadvantage?1:2},rollD20);
  const naturalRoll=advantage===disadvantage?rolls[0]:advantage?Math.max(...rolls):Math.min(...rolls);
  const appliedRoll=summary.reliableTalent&&(trainedSkill||trainedTool)?Math.max(10,naturalRoll):naturalRoll;
  const modifier=summary.skillModifiers[skillId]+(trainedTool&&!trainedSkill?summary.trainingBonus:0);
  return {rolls,naturalRoll,appliedRoll,checkTotal:appliedRoll+modifier,advantage,disadvantage};
}

function hide(character,summary){
  const check=rollSkill(character,summary,'stealth');
  const dc=15,success=check.checkTotal>=dc;
  if(success){
    const state=character.rulesRuntime;
    state.conditions=state.conditions.filter(c=>c.conditionId!=='invisible'||c.source!=='hide');
    state.conditions.push({conditionId:'invisible',source:'hide'});
    state.hideCheckTotal=check.checkTotal;
  }
  return {...check,dc,success};
}

module.exports={rollSkill,hide};
