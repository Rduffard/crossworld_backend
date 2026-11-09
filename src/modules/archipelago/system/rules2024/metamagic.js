const options = [
  ['careful-spell','Careful Spell',1,'Choose up to max(1, Spirit modifier) saving creatures; they succeed and take no damage if success normally halves damage.'],
  ['distant-spell','Distant Spell',1,'Double range of at least 5 feet; Touch becomes 30 feet. Area size is unchanged.'],
  ['empowered-spell','Empowered Spell',1,'Reroll up to max(1, Spirit modifier) damage dice and use new rolls; may combine with another option.'],
  ['extended-spell','Extended Spell',1,'Double duration of at least one minute to at most 24 hours; advantage on Concentration saves for this casting.'],
  ['heightened-spell','Heightened Spell',2,'One target has disadvantage on all saves against this spell for its duration.'],
  ['quickened-spell','Quickened Spell',2,'Action becomes Bonus Action; no other level-one-or-higher spell before or after it on this turn.'],
  ['seeking-spell','Seeking Spell',1,'Reroll one missed spell attack and use the new roll; may combine with another option.'],
  ['subtle-spell','Subtle Spell',1,'Remove V/S and unpriced, nonconsumed M components.'],
  ['transmuted-spell','Transmuted Spell',1,'Change one Acid/Cold/Fire/Lightning/Poison/Thunder damage type to another from that list.'],
  ['twinned-spell','Twinned Spell',1,'Increase target count as if one slot level higher only for spells whose higher-slot text adds targets.'],
].map(([id,name,cost,description])=>({id,name,cost,description}));
function validate(summary, selected, spell, state, params={}) {
  const fail=message=>{throw Object.assign(new Error(message),{statusCode:422});};
  if(!Array.isArray(selected)||new Set(selected).size!==selected.length)fail('Select distinct Metamagic options');
  const known=summary.pathSelections.tidecaller?.metamagic??[];
  const active=state.effects.some(e=>e.featureId==='calling:tidecaller:innate-sorcery:1'&&(e.expiresAt===undefined||e.expiresAt>require('./clock').now(state)));
  const limit=active&&summary.callingLevels.tidecaller>=7?2:1;
  const ordinary=selected.filter(id=>!['empowered-spell','seeking-spell'].includes(id));
  if(ordinary.length>limit||selected.some(id=>!known.includes(id)||!options.some(o=>o.id===id)))fail('Unavailable Metamagic combination');
  if(selected.includes('quickened-spell')&&!['Action','Action or Ritual'].includes(spell.castingTime))fail('Quickened requires Action casting');
  const profile=require('./spellProfiles')[spell.id];
  if(selected.some(id=>['empowered-spell','seeking-spell'].includes(id)))fail('Apply Empowered after a damage roll or Seeking after a missed spell attack using the saved casting');
  if(selected.includes('distant-spell')&&profile.range.kind!=='touch'&&!(profile.range.feet>=5))fail('Distant requires Touch or a range of at least five feet');
  if(selected.includes('extended-spell')&&profile.durationSeconds<60)fail('Extended requires a duration of at least one minute');
  if(selected.includes('twinned-spell')&&!profile.twinnable)fail('Twinned requires higher-slot additional targets');
  if(selected.includes('heightened-spell')&&(!profile.savingThrow||typeof params.heightenedTarget!=='string'||!params.heightenedTarget.trim()))fail('Heightened requires one target of a spell with saving throws');
  if(selected.includes('transmuted-spell')&&(!['acid','cold','fire','lightning','poison','thunder'].includes(params.damageType)||!['acid','cold','fire','lightning','poison','thunder'].includes(params.originalDamageType)||params.damageType===params.originalDamageType||!profile.damageTypes.includes(params.originalDamageType)))fail('Choose different eligible original and replacement damage types');
  if(selected.includes('careful-spell')&&(!profile.savingThrow||!Array.isArray(params.exemptTargets)||new Set(params.exemptTargets).size!==params.exemptTargets.length||params.exemptTargets.some(id=>typeof id!=='string'||!id.trim()||id.length>100)||params.exemptTargets.length>Math.max(1,summary.attributeModifiers.spirit)))fail('Careful requires distinct saving targets within your Spirit limit');
  let free=params.freeMetamagic;
  if(free&&(!active||summary.callingLevels.tidecaller<20||!selected.includes(free)))fail('Arcane Apotheosis unavailable');
  return selected.reduce((sum,id)=>sum+(id===free?0:options.find(o=>o.id===id).cost),0);
}
function project(spell,selected,params={},slotLevel=spell.level){
  const profile=structuredClone(require('./spellProfiles')[spell.id]);
  if(spell.id==='hunter-s-mark')profile.durationSeconds=slotLevel>=5?86400:slotLevel>=3?28800:3600;
  if(selected.includes('distant-spell'))profile.range={kind:'distance',feet:profile.range.kind==='touch'?30:profile.range.feet*2};
  if(selected.includes('extended-spell'))profile.durationSeconds=Math.min(86400,profile.durationSeconds*2);
  if(selected.includes('subtle-spell'))profile.components=spell.specificMaterial||profile.consumedMaterial?['M']:[];
  if(selected.includes('transmuted-spell'))profile.damageTypes=profile.damageTypes.map(id=>id===params.originalDamageType?params.damageType:id);
  return {...profile,castingTime:selected.includes('quickened-spell')?'Bonus Action':spell.castingTime,
    targetScalingLevel:slotLevel+(selected.includes('twinned-spell')?1:0),
    ...(selected.includes('careful-spell')?{carefulTargets:params.exemptTargets,carefulNoHalfDamage:true}:{}),
    ...(selected.includes('heightened-spell')?{heightenedTarget:params.heightenedTarget,disadvantageOnAllSaves:true}:{}),
    concentrationAdvantage:selected.includes('extended-spell')&&spell.concentration};
}
module.exports={options,validate,project};

