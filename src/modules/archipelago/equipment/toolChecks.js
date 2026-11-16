const {d20}=require('../combat/dice');
const {applyRollFloors,toolCheckModifiers,toolCheckTasks,toolCheckTraining,toolCheckCircumstances,checkSucceeded}=require('@crossworld/sanguine-engine/dice');
const {ghostTradeBonus,ghostTradeMatches}=require('@crossworld/sanguine-engine/callings');
const {normalizeToolTraining:normalize}=require('@crossworld/sanguine-engine/training');
const turns=require('../spells/castingTurn');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,summary,p){
  if(!p||Object.keys(p).some(k=>!['instanceId','attribute','skillId','dc','eventId','advantage','disadvantage','confirmed','task','turnId'].includes(k))||p.confirmed!==true||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Confirm the tool, attribute, applicable skill and stable check ID');
  const task=p.task??'general';if(!toolCheckTasks.includes(task))fail('Choose an established tool task');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId),gear=require('./inventory'),d=item?.definitionId?gear.definition(item.definitionId):null;
  if(!d?.toolAbility)fail('Choose an owned catalog tool or instrument');
  if(require('../combat/vitality/vitality').incapacitated(c.rulesRuntime))fail('Cannot make a tool check while Incapacitated');
  const attribute=p.attribute??d.toolAbility;if(!Object.hasOwn(summary.attributeModifiers,attribute))fail('Choose an established check attribute');
  if(p.skillId!==undefined&&!require('../system/catalog').skills.some(s=>s.id===p.skillId)||p.dc!==undefined&&(!Number.isSafeInteger(p.dc)||p.dc<1||p.dc>1000)||[p.advantage,p.disadvantage].some(v=>v!==undefined&&typeof v!=='boolean'))fail('Choose a valid skill, DC and roll circumstances');
  const state=c.rulesRuntime;state.toolChecks??=[];if(state.toolChecks.some(r=>r.eventId===p.eventId))fail('This tool check has already been resolved');if(state.toolChecks.length>=200)fail('Too many recorded tool checks; complete a rest');
  const {toolTrained,skillTrained,expertise}=toolCheckTraining(summary,d.id,p.skillId);
  const ghostTrade=ghostTradeMatches(summary.paths.shipwright,summary.pathSelections.shipwright?.ghostTrade,task);
  const savedTurn=turns.current(state);
  const turnId=savedTurn??(typeof p.turnId==='string'?p.turnId.trim():null);
  if(ghostTrade&&(!turns.validLabel(turnId)||state.inCombat&&!savedTurn||savedTurn&&p.turnId!==undefined&&p.turnId!==savedTurn))fail('Record the current turn ID for the Ghost Patch trade bonus');
  const ghostKey=turnId&&`${state.initiative?.combatId??'scene'}:${turnId}`;
  const tradeBonus=ghostTradeBonus(ghostTrade,(state.counters.ghostTradeTurns??[]).includes(ghostKey),summary.attributeModifiers.wit);
  const {modifier,minimumNatural,minimumTotal}=toolCheckModifiers({
    attribute,attributeModifier:summary.attributeModifiers[attribute],trainingBonus:summary.trainingBonus,toolTrained,skillTrained,expertise,
    exhaustion:state.exhaustion,tradeBonus,reliableTalent:summary.reliableTalent,minimumMightTestTotal:summary.minimumMightTestTotal,
  });
  const {featureAdvantage,advantage,hasDisadvantage,checkArmor}=toolCheckCircumstances(summary,{
    task,attribute,skillId:p.skillId,toolTrained,skillTrained,advantage:p.advantage,disadvantage:p.disadvantage,
  });
  const disadvantage=Boolean(hasDisadvantage||checkArmor&&require('./equipmentView').derive(c).restrictions.untrainedArmor);
  const {dice:rolls,selected:naturalRoll}=d20({advantage,disadvantage});
  const {applied:appliedRoll,total}=applyRollFloors(naturalRoll,modifier,minimumNatural,minimumTotal);
  if(tradeBonus){state.counters.ghostTradeTurns??=[];if(state.counters.ghostTradeTurns.length>=200)fail('Too many Ghost Patch trade turns; complete a rest');state.counters.ghostTradeTurns.push(ghostKey);}
  const result={type:'tool.check',eventId:p.eventId,definitionId:d.id,attribute,task,tradeBonus,featureAdvantage:Boolean(featureAdvantage),...(p.skillId?{skillId:p.skillId}:{}),modifier,toolTrained,skillTrained,expertise,advantage,disadvantage,rolls,naturalRoll,appliedRoll,reliableTalentApplied:appliedRoll!==naturalRoll,total,...(p.dc!==undefined?{dc:p.dc,success:checkSucceeded(total,p.dc)}:{})};
  require('../characters/runtime/featState').action(state);state.toolChecks.push(result);state.revision++;require('../characters/runtime/runtimeValidation').validateProjected(summary,state);return result;
}
module.exports={apply,normalize};
