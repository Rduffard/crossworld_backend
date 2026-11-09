const {randomInt}=require('node:crypto');
const turns=require('./castingTurn');
const aliases={'navigators-tools':'navigator-tools','carpenters-tools':'carpenter-tools','masons-tools':'mason-tools','smiths-tools':'smith-tools','tinkers-tools':'tinker-tools','poisoners-kit':'poisoner-kit','calligraphers-supplies':'calligrapher-tools'};
const normalize=id=>aliases[id]??id.replace(/^instrument:/,'');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function apply(c,summary,p){
  if(!p||Object.keys(p).some(k=>!['instanceId','attribute','skillId','dc','eventId','advantage','disadvantage','confirmed','task','turnId'].includes(k))||p.confirmed!==true||typeof p.eventId!=='string'||!p.eventId.trim()||p.eventId.length>100)fail('Confirm the tool, attribute, applicable skill and stable check ID');
  const task=p.task??'general';if(!['general','inspect-explosives','reinforce-structure','covert-repair','sabotage','predict-weather','interpret-signals'].includes(task))fail('Choose an established tool task');
  const item=c.inventory.find(i=>i.instanceId===p.instanceId),gear=require('../../equipment'),d=item?.definitionId?gear.definition(item.definitionId):null;
  if(!d?.toolAbility)fail('Choose an owned catalog tool or instrument');
  if(require('./vitality').incapacitated(c.rulesRuntime))fail('Cannot make a tool check while Incapacitated');
  const attribute=p.attribute??d.toolAbility;if(!Object.hasOwn(summary.attributeModifiers,attribute))fail('Choose an established check attribute');
  if(p.skillId!==undefined&&!require('./catalog').skills.some(s=>s.id===p.skillId)||p.dc!==undefined&&(!Number.isSafeInteger(p.dc)||p.dc<1||p.dc>1000)||[p.advantage,p.disadvantage].some(v=>v!==undefined&&typeof v!=='boolean'))fail('Choose a valid skill, DC and roll circumstances');
  const state=c.rulesRuntime;state.toolChecks??=[];if(state.toolChecks.some(r=>r.eventId===p.eventId))fail('This tool check has already been resolved');if(state.toolChecks.length>=200)fail('Too many recorded tool checks; complete a rest');
  const toolTrained=summary.equipmentTraining.tools.some(id=>normalize(id)===d.id),skillTrained=p.skillId?summary.training.includes(p.skillId):false;
  const expertise=summary.toolExpertise.some(id=>normalize(id)===d.id)||Boolean(p.skillId&&summary.expertise.includes(p.skillId));
  const ghostTrade=summary.paths.shipwright==='drydock-ghost'&&summary.pathSelections.shipwright.ghostTrade===task;
  const savedTurn=turns.current(state);
  const turnId=savedTurn??(typeof p.turnId==='string'?p.turnId.trim():null);
  if(ghostTrade&&(!turns.validLabel(turnId)||state.inCombat&&!savedTurn||savedTurn&&p.turnId!==undefined&&p.turnId!==savedTurn))fail('Record the current turn ID for the Ghost Patch trade bonus');
  const ghostKey=turnId&&`${state.initiative?.combatId??'scene'}:${turnId}`;
  const tradeBonus=ghostTrade&&!(state.counters.ghostTradeTurns??[]).includes(ghostKey)?Math.max(1,summary.attributeModifiers.wit):0;
  const modifier=summary.attributeModifiers[attribute]+(expertise?2:toolTrained||skillTrained?1:0)*summary.trainingBonus-2*(state.exhaustion??0)+tradeBonus;
  const featureAdvantage=task==='inspect-explosives'&&summary.paths.gunslinger==='cinder-artillerist'&&summary.callingLevels.gunslinger>=7||task==='reinforce-structure'&&summary.paths.shipwright==='breakwater'&&summary.callingLevels.shipwright>=6||summary.paths.navigator==='storm-broker'&&(task==='predict-weather'&&attribute==='instinct'&&summary.pathSelections.navigator.stormDiscipline==='weather'||task==='interpret-signals'&&attribute==='wit'&&summary.pathSelections.navigator.stormDiscipline==='signals');
  const advantage=Boolean(p.advantage||toolTrained&&skillTrained||attribute==='might'&&summary.mightAdvantage||featureAdvantage||p.skillId==='stealth'&&summary.silentKeelStealth);
  const disadvantage=Boolean(p.disadvantage||summary.conditions.includes('poisoned')||['might','agility'].includes(attribute)&&gear.derive(c).restrictions.untrainedArmor);
  const rolls=Array.from({length:advantage===disadvantage?1:2},()=>randomInt(1,21)),naturalRoll=advantage===disadvantage?rolls[0]:advantage?Math.max(...rolls):Math.min(...rolls);
  const appliedRoll=summary.reliableTalent&&(toolTrained||skillTrained)?Math.max(10,naturalRoll):naturalRoll,total=Math.max(attribute==='might'?summary.minimumMightTestTotal??-10000:-10000,appliedRoll+modifier);
  if(tradeBonus){state.counters.ghostTradeTurns??=[];if(state.counters.ghostTradeTurns.length>=200)fail('Too many Ghost Patch trade turns; complete a rest');state.counters.ghostTradeTurns.push(ghostKey);}
  const result={type:'tool.check',eventId:p.eventId,definitionId:d.id,attribute,task,tradeBonus,featureAdvantage:Boolean(featureAdvantage),...(p.skillId?{skillId:p.skillId}:{}),modifier,toolTrained,skillTrained,expertise,advantage,disadvantage,rolls,naturalRoll,appliedRoll,reliableTalentApplied:appliedRoll!==naturalRoll,total,...(p.dc!==undefined?{dc:p.dc,success:total>=p.dc}:{})};
  require('./featOperations').action(state);state.toolChecks.push(result);state.revision++;require('./runtime').validateProjected(summary,state);return result;
}
module.exports={apply,normalize};
