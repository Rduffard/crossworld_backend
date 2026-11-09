const rules = require('./rules');
function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
function list(value, count, options) {
  if (!Array.isArray(value) || value.length !== count || new Set(value).size !== count || value.some(v => !options.includes(v)))
    fail('Invalid replacement selection');
}
function project(summary, state, character) {
  const result = structuredClone(summary);
  for (const spell of state.folio ?? []) {
    const definition = rules.spells.find(s => s.id === spell);
    if (!result.spellcasting.shipwright || !definition?.callings.includes('shipwright') || definition.level < 1 ||
        definition.level > result.spellcasting.shipwright.slots.length) fail('Invalid copied folio spell');
    if (result.spellcasting.shipwright.folio.includes(spell)) fail('Duplicate copied folio spell');
    result.spellcasting.shipwright.folio.push(spell);
  }
  if(result.spellcasting.shipwright){
    result.spellcasting.shipwright.folio=result.spellcasting.shipwright.folio.filter(id=>!state.folioUnavailable?.includes(id));
    result.spellcasting.shipwright.memorized=(state.folioMemory??[]).filter(id=>(state.preparations.shipwright??[]).includes(id)||result.spellcasting.shipwright.alwaysPrepared.includes(id)||state.selections?.shipwright?.spellMastery?.includes(id));
  }
  for (const [id, choices] of Object.entries(state.selections ?? {})) {
    if (!result.callingLevels[id] || !choices || typeof choices !== 'object' || Array.isArray(choices)) fail('Invalid saved selections');
    for (const [key, value] of Object.entries(choices)) {
      const casting = result.spellcasting[id];
      if (key === 'mastery') {
        const equipment = require('../blueprints/equipment');
        const training = result.equipmentTraining.weapons;
        const options = equipment.items.filter(w => w.kind === 'weapon' && !w.baseWeaponId && w.mastery &&
          (id !== 'reaver' || w.type === 'melee') && (training.includes(w.category) || training.includes(w.id) ||
          (training.includes('martial:finesse-or-light') && w.properties.some(p => ['finesse', 'light'].includes(p.id))))).map(w => w.id);
        list(value, result.mechanics[id].masteryCount, options);
      } else if (key === 'cantrips') {
        if (!casting) fail('Calling has no cantrips');
        list(value, casting.cantrips.length, rules.spells.filter(s => s.level === 0 && s.callings.includes(id)).map(s => s.id));
        casting.cantrips = [...value];
      } else if (key === 'spellMastery') {
        if (id !== 'shipwright' || result.callingLevels.shipwright < 18) fail('Spell Mastery unavailable');
        list(value, 2, [...new Set([...casting.folio,...(casting.memorized??[])])].filter(spell => { const s = rules.spells.find(d => d.id === spell); return [1, 2].includes(s.level) && ['Action','Action or Ritual'].includes(s.castingTime); }));
        if (new Set(value.map(spell => rules.spells.find(s => s.id === spell).level)).size !== 2) fail('Spell Mastery requires levels one and two');
        casting.alwaysPrepared = [...new Set([...casting.alwaysPrepared.filter(s => !casting.spellMastery.includes(s)), ...value])];
        casting.spellMastery = [...value];
      } else if(['hunterPrey','defensiveTactics'].includes(key)) {
        if(result.paths[id]!=='gray-net'||key==='defensiveTactics'&&result.callingLevels[id]<7)fail('Unavailable Gray Net choice');
        list(value,1,key==='hunterPrey'?['colossus-slayer','horde-breaker']:['escape-the-horde','multiattack-defense']);
        result.pathSelections[id][key]=value[0];
        continue;
      } else fail('Unknown saved replacement');
      result.pathSelections[id][key] = [...value];
    }
  }
  result.weaponMastery = [...new Set(Object.values(result.pathSelections).flatMap(c => c.mastery ?? []))];
  const active=(state.effects??[]).filter(e=>!e.expiresAt||e.expiresAt>require('./clock').now(state));
  if(result.paths.shipwright==='sparkwrite-aetherist')result.activeRelayIds=active.filter(e=>e.objectType==='relay'&&e.health?.current>0).map(e=>e.id);
  result.silentKeelStealth=active.some(e=>e.featureId==='path:drydock-ghost:silent-keel:10'&&e.mode==='creatures'&&e.targetIds?.includes(String(character?._id??'self')));
  if(result.feats.includes('boon-of-the-night-spirit')&&['dim','dark'].includes(state.environment?.light))result.resistances=[...new Set([...result.resistances,...require('./vitality').damageTypes.filter(id=>!['psychic','radiant'].includes(id))])];
  result.ignoresPhysicalResistance=result.feats.includes('boon-of-irresistible-offense');
  result.grapplerBenefits=result.feats.includes('grappler')?{attackAdvantageAgainstOwnGrapple:true,noExtraMovementForOwnSizeOrSmaller:true}:null;
  result.activeEffects=structuredClone(active);
  result.resistances=[...new Set([...result.resistances,...active.map(e=>e.damageResistance).filter(Boolean)])];
  result.noOpportunityAttacksForMovement=active.some(e=>e.noOpportunityAttacksForMovement);
  result.nextAttackAdvantage=active.some(e=>e.nextAttackAdvantage);
  result.poisonedSaveAdvantage=active.some(e=>e.poisonedSaveAdvantage)||result.paths.doctor==='plaguewarden'&&result.callingLevels.doctor>=6||result.paths.navigator==='mangrove-stalker'&&result.callingLevels.navigator>=7;
  if(result.paths.gunslinger==='iron-suppressor')result.entrenchedDrill={halfCoverAgainstRanged:result.callingLevels.gunslinger>=7&&Boolean(state.ownerTurn)&&(state.ownerTurn.movementFeet??0)<=5,guardAndAgilitySaveBonus:2,endsWhenMovedBeyondFeet:5};
  if(result.paths.gunslinger==='brass-outrider')result.outrider={mountDismountCostFeet:result.callingLevels.gunslinger>=7?5:null,ignoreRubbleAndSandDifficultTerrain:result.callingLevels.gunslinger>=7};
  if(result.paths.tidecaller==='memory-echo')result.telepathicLinks=active.filter(e=>e.telepathy).map(e=>({targetIds:e.targetIds,...e.telepathy}));
  if(result.paths.tidecaller==='tempest-heart'&&active.some(e=>e.livingTempest)){const type=result.pathSelections.tidecaller.pathDiscipline;result.immunities=[...new Set([...(result.immunities??[]),type])];result.resistances=[...new Set([...result.resistances,type==='lightning'?'thunder':'lightning'])];result.stormMovement={throughCreaturesAsDifficultTerrain:true,cannotEndInsideCreature:true};}
  if(result.paths.navigator==='starwake-pilot')result.starwake={guidedAllies:active.filter(e=>e.passage).flatMap(e=>e.targetIds.map(targetId=>({targetId,...e.passage}))),saveAdvantageAgainst:result.callingLevels.navigator>=7?['becoming-lost','unwilling-teleport']:[]};
  if(result.paths.navigator==='mangrove-stalker')result.mangrove={poisonedSaveAdvantage:result.callingLevels.navigator>=7,ignoreNonmagicalPlantMovementCost:result.callingLevels.navigator>=7,ignoreNonmagicalPlantDamage:result.callingLevels.navigator>=7};
  result.detectFalseAdvantage=active.some(e=>e.detectFalseAdvantage);
  result.studiedSneakTargets=active.filter(e=>e.studyTargetId).map(e=>e.studyTargetId);
  result.unseenAttackAdvantageSuppressedTargets=active.filter(e=>e.suppressesUnseenAdvantageAgainstOwner).map(e=>e.markedTargetId);
  if(active.some(e=>e.featureId==='calling:reaver:rage:1')) {
    result.resistances=[...new Set([...result.resistances,'bludgeoning','piercing','slashing'])];
    result.raging=true;
    result.mightAdvantage=true;
    if(result.callingLevels.reaver>=3)result.rageSkillModifiers=Object.fromEntries(['acrobatics','intimidation','perception','stealth','survival'].map(id=>[id,result.attributeModifiers.might+(result.expertise.includes(id)?2:result.training.includes(id)?1:0)*result.trainingBonus]));
  }
  if(result.paths.reaver==='thunderhide'&&result.raging)result.resistances=[...new Set([...result.resistances,result.pathSelections.reaver.pathDiscipline])];
  if(result.paths.reaver==='chainbreaker'&&result.raging){result.chainbreaker={saveAdvantageAgainst:result.callingLevels.reaver>=6?['paralyzed','restrained']:[],rescuerAuraFeet:result.callingLevels.reaver>=6&&result.pathSelections.reaver.pathDiscipline==='rescuer'?5:0,doubleDamageAgainstRestraints:result.callingLevels.reaver>=6&&result.pathSelections.reaver.pathDiscipline==='breaker'};}
  if(result.paths.reaver==='reef-colossus'&&result.raging){result.reefSkinSuppressed=active.some(e=>e.reefSkinSuppressed);result.colossus={effectiveSize:result.creation.size==='small'?'medium':'large',carryingMultiplier:result.creation.size==='small'?1:2,forcedMovementSaveAdvantage:result.pathSelections.reaver.pathDiscipline==='anchor',objectDamageBonus:result.pathSelections.reaver.pathDiscipline==='breaker'?result.mechanics.reaver.rageDamage:0,ownTurnMeleeReachBonus:result.callingLevels.reaver>=14?5:0};}
  const flight=active.reduce((max,e)=>Math.max(max,e.flySpeed??0),result.movement.fly);
  result.movement.fly=flight;
  if(active.some(e=>e.optionId==='path:drydock-ghost:unseen-passage:14#main')){
    result.movement.climb='walk';result.movement.swim='walk';result.structurePassage=true;
  }
  if(active.some(e=>e.featureId==='calling:tidecaller:innate-sorcery:1')&&result.spellcasting.tidecaller){
    result.spellcasting.tidecaller.saveDC++;
    result.spellcasting.tidecaller.attackAdvantage=true;
  }
  result.concentrationSaveAdvantage=result.feats.includes('steady-channel')||active.some(e=>e.concentration&&e.metamagic?.includes('extended-spell'));
  if(result.paths.shipwright==='sparkwrite-aetherist'&&result.callingLevels.shipwright>=6&&active.some(e=>e.objectType==='relay'&&e.health?.current>0&&e.withinTenFeet)){
    result.resistances=[...new Set([...result.resistances,'lightning'])];
    result.concentrationSaveAdvantage=true;
  }
  result.attunementLimit=result.paths.corsair==='reef-knife'&&result.callingLevels.corsair>=13?4:3;
  result.criticalThreshold=result.paths.gunslinger==='deadeye'?(result.callingLevels.gunslinger>=15?18:19):20;
  const incapacitated=require('./vitality').incapacitated(state);
  result.smiteProtectionAura=!incapacitated&&active.some(e=>e.smiteProtection)?{halfCover:true,radiusFeet:result.callingLevels.warden>=18?30:10}:null;
  result.holyNimbus=!incapacitated&&result.auraOfProtection&&active.some(e=>e.holyNimbus)?{saveAdvantageAgainst:['fiend','undead'],sunlight:true,radiusFeet:result.callingLevels.warden>=18?30:10,enemyStartTurnDamage:result.attributeModifiers.spirit+result.trainingBonus}:null;
  result.reliableTalent=result.callingLevels.corsair>=7;
  result.evasion=result.callingLevels.corsair>=7&&!incapacitated;
  result.elusive=result.callingLevels.corsair>=18&&!incapacitated;
  result.recklessAttack=state.effects.some(e=>e.recklessAttack);
  result.attacksAgainstHaveAdvantage=result.recklessAttack&&!result.elusive;
  result.studiedAttackTargets=state.effects.filter(e=>e.studiedAttack).map(e=>e.targetId);
  result.opportunityAttacksAgainstHaveDisadvantage=result.paths.navigator==='gray-net'&&result.pathSelections.navigator.defensiveTactics==='escape-the-horde';
  result.multiattackDefenseSources=state.effects.filter(e=>e.multiattackDefense).map(e=>({targetId:e.multiattackDefense,turnId:e.turnId}));
  result.huntersLoreTargets=result.paths.navigator==='gray-net'?active.filter(e=>e.featureId==='spell:hunter-s-mark').flatMap(e=>e.targets??[]):[];
  result.agilitySaveAdvantage=result.callingLevels.reaver>=2&&!incapacitated;
  result.minimumMightTestTotal=result.callingLevels.reaver>=18?result.attributes.might:null;
  result.athleticsAdvantage=result.paths.gunslinger==='deadeye';
  result.preciseHunterTargetIds=result.callingLevels.navigator>=17?active.filter(e=>e.featureId==='spell:hunter-s-mark').flatMap(e=>e.targets??[]):[];
  result.conditions=[...new Set([...(state.conditions??[]).map(c=>c.conditionId),...active.map(e=>e.condition).filter(Boolean),...(state.health?.current===0?['unconscious']:[]),...(incapacitated?['incapacitated']:[])])];
  if(result.conditions.includes('petrified')){result.resistances=[...new Set([...result.resistances,...require('./vitality').damageTypes])];result.immunities=[...new Set([...(result.immunities??[]),'poison'])];}
  result.conditionImmunities=[...(result.conditions.includes('petrified')?['poisoned']:[]),...(result.paths.reaver==='bloodwake'&&result.raging&&result.callingLevels.reaver>=6?['charmed','frightened']:[]),...(result.auraOfProtection&&!incapacitated&&result.callingLevels.warden>=10?['frightened']:[]),...(result.auraOfProtection&&!incapacitated&&result.paths.warden==='leviathan-anchor'&&result.callingLevels.warden>=7?['charmed']:[])];
  result.suppressedConditions=result.conditions.filter(id=>result.conditionImmunities.includes(id));result.conditions=result.conditions.filter(id=>!result.conditionImmunities.includes(id));
  result.exhaustion=state.exhaustion??0;result.dead=Boolean(state.deathSaves?.dead);
  if(incapacitated&&result.auraOfProtection){
    for(const id of Object.keys(result.savingThrowModifiers))result.savingThrowModifiers[id]-=result.auraOfProtection;
    result.auraOfProtection=0;
  }
  if(result.paths.warden==='iron-covenant'){
    const standard=active.some(e=>e.covenantStandard);
    result.covenantAura=result.auraOfProtection&&result.callingLevels.warden>=7?{radiusFeet:result.callingLevels.warden>=18?30:10,saveAdvantageAgainst:['forced-movement','prone'],standardTemporaryHealth:standard?Math.max(1,result.attributeModifiers.spirit):0}:null;
    if(standard){result.resistances=[...new Set([...result.resistances,'bludgeoning','piercing','slashing'])];result.preventsEnemyForcedMovement=true;}
  }
  if(result.paths.warden==='oath-of-the-free-port')result.passageAura=result.auraOfProtection&&result.callingLevels.warden>=7?{radiusFeet:result.callingLevels.warden>=18?30:10,ignoreNonmagicalDifficultTerrain:true,escapeGrappleAdvantage:true,openHarbor:active.some(e=>e.openHarbor)}:null;
  if(result.paths.warden==='lantern-vigil'){
    result.clearSightAura=result.auraOfProtection&&result.callingLevels.warden>=7?{radiusFeet:result.callingLevels.warden>=18?30:10,seeThroughNonmagicalFog:true,undeadFearSaveAdvantage:true,piercesMagicalDarkness:false,dawnSunlight:active.some(e=>e.dawnSunlight)}:null;
    if(active.some(e=>e.dawnSunlight)&&result.auraOfProtection)result.resistances=[...new Set([...result.resistances,'necrotic'])];
  }
  const penalty=2*result.exhaustion;
  for(const mapping of [result.skillModifiers,result.savingThrowModifiers])for(const id of Object.keys(mapping))mapping[id]-=penalty;
  result.initiative.modifier-=penalty;
  for(const casting of [...Object.values(result.spellcasting),...(result.featSpellcasters??[])])casting.attackModifier-=penalty;
  if(character)require('../../equipment/magic').project(result,character);
  const walkingSpeed=result.movement.walk;
  for(const key of ['walk','fly','swim','climb'])result.movement[key]=Math.max(0,(result.movement[key]==='walk'?walkingSpeed:result.movement[key])-5*result.exhaustion);
  if(active.some(e=>e.steadyAim))for(const key of ['walk','fly','swim','climb'])result.movement[key]=0;
  if(result.conditions.some(id=>['grappled','paralyzed','petrified','restrained','stunned','unconscious'].includes(id)))for(const key of ['walk','fly','swim','climb'])result.movement[key]=0;
  result.senses={...(result.senses??{}),...(result.feats.includes('boon-of-truesight')?{truesight:60}:{}),...(result.callingLevels.navigator>=18?{blindsight:30}:result.paths.corsair==='hollow-lantern'&&result.callingLevels.corsair>=13&&!incapacitated?{blindsight:10}:{})};
  result.corridorDcBonus=active.some(e=>e.corridorDC)?2:0;
  const abilities=require('./abilityOperations');
  result.abilityOptions=abilities.list(result).map(option=>{
    const missing=option.costs.find(cost=>(state.pools?.[cost.poolId]??0)<cost.amount);
    const blocked=incapacitated&&['Action','Bonus Action','Reaction','Magic action','Attack action rider'].includes(option.action);
    let unavailableReason=blocked?'Incapacitated':missing?'Insufficient resources':null;
    if(!unavailableReason&&option.handler==='action-surge'){
      if(state.inCombat&&!state.ownerTurn?.open)unavailableReason='Requires your open owner turn';
      else if(state.ownerTurn?.open&&state.counters.actionSurgeTurns?.includes(state.ownerTurn.id))unavailableReason='Action Surge was already used this turn';
    }
    const kitCharges=option.preview?.kitCharges;
    if(!unavailableReason&&kitCharges&&character?.inventory&&!abilities.availableKit(character,kitCharges))unavailableReason=`Requires a healer's kit with ${kitCharges} available ${kitCharges===1?'charge':'charges'}`;
    if(!unavailableReason&&['echo-link','tempest-pulse','tempest-convert'].includes(option.handler)&&!state.ownerTurn?.open)unavailableReason='Requires your open owner turn';
    if(!unavailableReason&&option.handler==='tempest-pulse'){
      const last=state.castings?.at(-1);
      if(!last||last.slotLevel<1||last.turnId!==state.ownerTurn.id)unavailableReason='First record a level-one-or-higher spell on this turn';
      else if(state.counters.tempestPulses?.includes(state.ownerTurn.id))unavailableReason='Storm Pulse already resolved this turn';
    }
    if(!unavailableReason&&option.handler.startsWith('relay-')&&option.handler!=='relay-place'&&!result.activeRelayIds?.length)unavailableReason='Place a live relay first';
    if(!unavailableReason&&option.handler==='barrier-reduce'&&!active.some(e=>e.objectType==='barrier'&&e.health?.current>0))unavailableReason='Place a live barrier first';
    if(!unavailableReason&&['measured-charge','grand-battery'].includes(option.handler)&&character?.inventory&&character?.loadout)unavailableReason=require('./cinderOperations').unavailableReason(character);
    if(!unavailableReason&&['stormhide-retaliate','reaver-path-hit','stormhide-walking','stormhide-pulse','chainbreaker-kneel','colossus-deck','colossus-suppress'].includes(option.handler)&&!result.raging)unavailableReason='Requires active Rage';
    if(!unavailableReason&&option.handler==='stormhide-pulse'&&!active.some(e=>e.walkingStorm))unavailableReason='Activate Walking Storm first';
    if(!unavailableReason&&['mangrove-hit','mangrove-predator'].includes(option.handler)&&!active.some(e=>e.featureId==='spell:hunter-s-mark'&&e.targets?.length))unavailableReason="Apply Hunter's Mark first";
    if(!unavailableReason&&option.handler==='outrider-passing'){
      const hit=state.ownerTurn?.open?state.ownerTurn.firstWeaponHit:null;
      if(!hit)unavailableReason='Record your first weapon hit this turn';
      else if(hit.voluntarySpeedFeet<20||hit.recoilBeforeHit)unavailableReason='The first hit requires 20 feet of Speed movement and no earlier Recoil';
      else if(state.counters.passingShots?.some(entry=>entry.turnId===state.ownerTurn.id))unavailableReason='Passing Shot already resolved this turn';
    }
    if(!unavailableReason&&option.handler==='vigil-hit'){
      const hit=state.ownerTurn?.open?state.ownerTurn.firstWeaponHit:null;
      if(incapacitated)unavailableReason='Incapacitated';
      else if(state.counters.vigilHits?.some(entry=>entry.turnId===state.ownerTurn?.id))unavailableReason='Light the Watch already added damage this turn';
      else if(!hit?.watchId||!active.some(e=>e.watchLight&&e.id===hit.watchId))unavailableReason='Record the first weapon hit during an active Light the Watch';
    }
    return {...option,available:!unavailableReason,unavailableReason};
  });
  return result;
}
function replace(summary, state, selections, type) {
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)) fail('Invalid rest selections');
  const current = project(summary, state);
  for (const [id, changes] of Object.entries(selections)) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) fail('Invalid replacements');
    for (const [key, value] of Object.entries(changes)) {
      const grayNet=['hunterPrey','defensiveTactics'].includes(key)&&current.paths[id]==='gray-net';
      if (type !== 'long-rest' && !grayNet) fail('These replacements require a Long Rest');
      if (key === 'cantrips' && id !== 'shipwright') fail('Cantrip replacement requires a Calling level');
      const old = key === 'spellMastery' ? current.spellcasting[id]?.spellMastery : grayNet ? [current.pathSelections[id]?.[key]] : current.pathSelections[id]?.[key];
      if (!Array.isArray(old) || !Array.isArray(value)) fail('Unavailable replacement');
      const changed = value.filter(v => !old.includes(v)).length;
      if(key==='spellMastery'&&value.some(v=>!old.includes(v)&&!current.spellcasting.shipwright.folio.includes(v)))fail('New Spell Mastery selections require an available folio spell');
      if (changed > (key === 'mastery' && ['corsair', 'navigator', 'warden'].includes(id) ? old.length : 1)) fail('Replacement limit exceeded');
      state.selections ??= {};
      state.selections[id] = { ...state.selections[id], [key]: value };
    }
  }
  project(summary, state);
}
module.exports = { project, replace };
