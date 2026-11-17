const { projectConditions, conditionsPreventMovement } = require('@crossworld/sanguine-engine/vitality');
const { callingCantripEligible } = require('@crossworld/sanguine-engine/spells/casting-sources');
const { exhaustedMovement, maximumGrantedMovement } = require('@crossworld/sanguine-engine/equipment/movement');
const { reefKnifeAttunementLimit } = require('@crossworld/sanguine-engine/equipment/item-effects');
const { smiteOfProtectionAura, holyNimbus, wardenPathAuras, spellMasterySpellEligible, spellMasteryReplacements,
  alwaysPreparedAfterMastery, grayNetReplacementOptions, copiedFolioSpellEligible, spellMasteryUnlocked } = require('@crossworld/sanguine-engine/callings');
const { gunslingerCriticalThreshold, rageSkillModifiers, entrenchedDrill, reefColossus, stormPulseFollowsCast, holdTheCorridorDCBonus } = require('@crossworld/sanguine-engine/callings');
const { passingShotEligible, poisonedSaveAdvantage, outriderTraversal, mangroveTraversal, starwakeSaveAdvantage, chainbreakerRage,
  corsairDefense, reaverDefense, callingSenses, livingTempestBenefits, innateSorceryCasting,
  primalKnowledgeUnlocked, preciseHunterUnlocked } = require('@crossworld/sanguine-engine/callings');
const { featPassives } = require('@crossworld/sanguine-engine/feats');
const { rageDefenseBenefits, recklessAttackBenefits, concentrationAdvantage,
  relayDefenseBenefits, unseenPassageBenefits } = require('@crossworld/sanguine-engine/callings');
const { weaponMasteryEligible } = require('@crossworld/sanguine-engine/training');
const { abilityTakesAction, firstMissingAbilityCost } = require('@crossworld/sanguine-engine/callings');
const { exhaustionD20Penalty, projectSavingThrowModifiers } = require('@crossworld/sanguine-engine/saving-throws');
const rules = require('../../system/rules');
function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
function list(value, count, options) {
  if (!Array.isArray(value) || value.length !== count || new Set(value).size !== count || value.some(v => !options.includes(v)))
    fail('Invalid replacement selection');
}
function project(summary, state, character) {
  const result = structuredClone(summary);
  const form = require('./lineageAbilities').form(summary, state);
  if (form) {
    const { attributeModifier } = require('@crossworld/sanguine-engine/attributes');
    const { skills } = require('../../system/catalog');
    result.animalForm = { ...form, currentHealth: state.animalForms.healthByForm[form.id] };
    result.size = form.size;
    result.creatureType = form.type;
    result.movement = { ...form.movement };
    result.senses = { ...form.senses };
    for (const [id, score] of Object.entries(form.attributes)) {
      const modifier = attributeModifier(score);
      const delta = modifier - result.attributeModifiers[id];
      result.attributes[id] = score;
      result.attributeModifiers[id] = modifier;
      result.savingThrowModifiers[id] += delta;
      if (id === 'agility') result.initiative.modifier += delta;
      for (const skill of skills.filter(skill => skill.attribute === id))
        result.skillModifiers[skill.id] += delta;
    }
  }
  if (state.lineageAppearance) {
    result.appearance = structuredClone(state.lineageAppearance);
    result.size = result.appearance.size;
  }
  for (const spell of state.folio ?? []) {
    const definition = rules.spells.find(s => s.id === spell);
    if (!copiedFolioSpellEligible(definition,result.spellcasting.shipwright)) fail('Invalid copied folio spell');
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
        const equipment = require('../../system/blueprints/equipment/index');
        const training = result.equipmentTraining.weapons;
        const options = equipment.items.filter(weapon => weaponMasteryEligible(weapon,id,training,true)).map(weapon => weapon.id);
        list(value, result.mechanics[id].masteryCount, options);
      } else if (key === 'cantrips') {
        if (!casting) fail('Calling has no cantrips');
        list(value, casting.cantrips.length, rules.spells.filter(s => callingCantripEligible(s,id)).map(s => s.id));
        casting.cantrips = [...value];
      } else if (key === 'spellMastery') {
        if (!spellMasteryUnlocked(id,result.callingLevels.shipwright)) fail('Spell Mastery unavailable');
        list(value, 2, [...new Set([...casting.folio,...(casting.memorized??[])])].filter(spellId => spellMasterySpellEligible(rules.spells.find(spell => spell.id === spellId))));
        if (!spellMasteryReplacements(value.map(spellId => rules.spells.find(spell => spell.id === spellId)))) fail('Spell Mastery requires levels one and two');
        casting.alwaysPrepared = alwaysPreparedAfterMastery(casting.alwaysPrepared,casting.spellMastery,value);
        casting.spellMastery = [...value];
      } else if(['hunterPrey','defensiveTactics'].includes(key)) {
        const options=grayNetReplacementOptions(result.paths[id],result.callingLevels[id],key);
        if(!options.length)fail('Unavailable Gray Net choice');
        list(value,1,options);
        result.pathSelections[id][key]=value[0];
        continue;
      } else fail('Unknown saved replacement');
      result.pathSelections[id][key] = [...value];
    }
  }
  result.weaponMastery = [...new Set(Object.values(result.pathSelections).flatMap(c => c.mastery ?? []))];
  for (const grant of result.innateSpells ?? []) {
    if (grant.replacement && state.lineageCantrip) {
      validateCantrip(state.lineageCantrip, grant);
      grant.spellId = state.lineageCantrip.spellId;
    }
    grant.castSupported = grant.unlocked;
    grant.attackModifier -= exhaustionD20Penalty(state.exhaustion ?? 0);
  }
  if (state.lineageCantrip && !result.innateSpells?.some(grant => grant.replacement))
    fail('No replaceable Lineage cantrip');
  const active=(state.effects??[]).filter(e=>!e.expiresAt||e.expiresAt>require('../../combat/effects/effectTime').now(state));
  if(result.paths.shipwright==='sparkwrite-aetherist')result.activeRelayIds=active.filter(e=>e.objectType==='relay'&&e.health?.current>0).map(e=>e.id);
  result.silentKeelStealth=active.some(e=>e.featureId==='path:drydock-ghost:silent-keel:10'&&e.mode==='creatures'&&e.targetIds?.includes(String(character?._id??'self')));
  const passiveFeats=featPassives(result.feats,state.environment?.light);
  if(passiveFeats.resistances.length)result.resistances=[...new Set([...result.resistances,...passiveFeats.resistances])];
  result.ignoresPhysicalResistance=passiveFeats.ignoresPhysicalResistance;
  result.grapplerBenefits=passiveFeats.grapplerBenefits;
  result.activeEffects=structuredClone(active);
  result.resistances=[...new Set([...result.resistances,...active.map(e=>e.damageResistance).filter(Boolean)])];
  result.noOpportunityAttacksForMovement=active.some(e=>e.noOpportunityAttacksForMovement);
  result.nextAttackAdvantage=active.some(e=>e.nextAttackAdvantage);
  result.poisonedSaveAdvantage=active.some(e=>e.poisonedSaveAdvantage)||poisonedSaveAdvantage(result.paths,result.callingLevels);
  if(result.lineage?.saveAdvantages.some(save=>save.conditionId==='poisoned'))result.poisonedSaveAdvantage=true;
  if(result.paths.gunslinger==='iron-suppressor')result.entrenchedDrill=entrenchedDrill(result.callingLevels.gunslinger,state.ownerTurn);
  if(result.paths.gunslinger==='brass-outrider')result.outrider=outriderTraversal(result.callingLevels.gunslinger);
  if(result.paths.tidecaller==='memory-echo')result.telepathicLinks=active.filter(e=>e.telepathy).map(e=>({targetIds:e.targetIds,...e.telepathy}));
  if(result.paths.tidecaller==='tempest-heart'&&active.some(e=>e.livingTempest)){
    const tempest=livingTempestBenefits(result.pathSelections.tidecaller.pathDiscipline);
    result.immunities=[...new Set([...(result.immunities??[]),tempest.immunity])];
    result.resistances=[...new Set([...result.resistances,tempest.resistance])];
    result.stormMovement=tempest.stormMovement;
  }
  if(result.paths.navigator==='starwake-pilot')result.starwake={guidedAllies:active.filter(e=>e.passage).flatMap(e=>e.targetIds.map(targetId=>({targetId,...e.passage}))),saveAdvantageAgainst:starwakeSaveAdvantage(result.callingLevels.navigator)};
  if(result.paths.navigator==='mangrove-stalker')result.mangrove=mangroveTraversal(result.callingLevels.navigator);
  result.detectFalseAdvantage=active.some(e=>e.detectFalseAdvantage);
  result.studiedSneakTargets=active.filter(e=>e.studyTargetId).map(e=>e.studyTargetId);
  result.unseenAttackAdvantageSuppressedTargets=active.filter(e=>e.suppressesUnseenAdvantageAgainstOwner).map(e=>e.markedTargetId);
  if(active.some(e=>e.featureId==='calling:reaver:rage:1')) {
    const {resistances,mightAdvantage}=rageDefenseBenefits();
    result.resistances=[...new Set([...result.resistances,...resistances])];
    result.raging=true;
    result.mightAdvantage=mightAdvantage;
    if(primalKnowledgeUnlocked(result.callingLevels.reaver))result.rageSkillModifiers=rageSkillModifiers({ ...result, might: result.attributeModifiers.might });
  }
  if(result.paths.reaver==='thunderhide'&&result.raging)result.resistances=[...new Set([...result.resistances,result.pathSelections.reaver.pathDiscipline])];
  if(result.paths.reaver==='chainbreaker'&&result.raging)result.chainbreaker=chainbreakerRage(result.callingLevels.reaver,result.pathSelections.reaver.pathDiscipline);
  if(result.paths.reaver==='reef-colossus'&&result.raging){
    result.reefSkinSuppressed=active.some(e=>e.reefSkinSuppressed);
    result.colossus=reefColossus(result.callingLevels.reaver,result.size??result.creation.size,result.pathSelections.reaver.pathDiscipline,result.mechanics.reaver.rageDamage);
  }
  result.movement.fly=maximumGrantedMovement(result.movement.fly,active.map(effect=>effect.flySpeed));
  if(active.some(e=>e.optionId==='path:drydock-ghost:unseen-passage:14#main')){
    const {movement,structurePassage}=unseenPassageBenefits();
    Object.assign(result.movement,movement);result.structurePassage=structurePassage;
  }
  if(active.some(e=>e.featureId==='calling:tidecaller:innate-sorcery:1')&&result.spellcasting.tidecaller){
    Object.assign(result.spellcasting.tidecaller,innateSorceryCasting(result.spellcasting.tidecaller));
  }
  result.concentrationSaveAdvantage=concentrationAdvantage(result.feats,active.some(e=>e.concentration&&e.metamagic?.includes('extended-spell')));
  const relayDefense=relayDefenseBenefits(result.paths.shipwright,result.callingLevels.shipwright,
    active.some(e=>e.objectType==='relay'&&e.health?.current>0&&e.withinTenFeet));
  if(relayDefense){
    result.resistances=[...new Set([...result.resistances,relayDefense.resistance])];
    result.concentrationSaveAdvantage=relayDefense.concentrationSaveAdvantage;
  }
  result.attunementLimit=reefKnifeAttunementLimit(result.paths.corsair,result.callingLevels.corsair);
  result.criticalThreshold=gunslingerCriticalThreshold(result.paths.gunslinger,result.callingLevels.gunslinger);
  const incapacitated=require('../../combat/vitality/healthState').incapacitated(state);
  result.smiteProtectionAura=!incapacitated&&active.some(e=>e.smiteProtection)?smiteOfProtectionAura(result.callingLevels.warden):null;
  result.holyNimbus=!incapacitated&&result.auraOfProtection&&active.some(e=>e.holyNimbus)?holyNimbus(result.callingLevels.warden, result.attributeModifiers.spirit, result.trainingBonus):null;
  Object.assign(result,corsairDefense(result.callingLevels.corsair,incapacitated));
  Object.assign(result,recklessAttackBenefits(state.effects.some(e=>e.recklessAttack),result.elusive));
  result.studiedAttackTargets=state.effects.filter(e=>e.studiedAttack).map(e=>e.targetId);
  result.opportunityAttacksAgainstHaveDisadvantage=result.paths.navigator==='gray-net'&&result.pathSelections.navigator.defensiveTactics==='escape-the-horde';
  result.multiattackDefenseSources=state.effects.filter(e=>e.multiattackDefense).map(e=>({targetId:e.multiattackDefense,turnId:e.turnId}));
  result.huntersLoreTargets=result.paths.navigator==='gray-net'?active.filter(e=>e.featureId==='spell:hunter-s-mark').flatMap(e=>e.targets??[]):[];
  Object.assign(result,reaverDefense(result.callingLevels.reaver,incapacitated,result.attributes.might));
  result.athleticsAdvantage=result.paths.gunslinger==='deadeye';
  result.preciseHunterTargetIds=preciseHunterUnlocked(result.callingLevels.navigator)?active.filter(e=>e.featureId==='spell:hunter-s-mark').flatMap(e=>e.targets??[]):[];
  const conditions=[...new Set([...(state.conditions??[]).map(c=>c.conditionId),...active.map(e=>e.condition).filter(Boolean),...(state.health?.current===0?['unconscious']:[]),...(incapacitated?['incapacitated']:[])])];
  Object.assign(result, projectConditions({
    conditions, resistances: result.resistances, immunities: result.immunities,
    levels: result.callingLevels, paths: result.paths, raging: result.raging,
    aura: result.auraOfProtection, incapacitated,
  }));
  result.exhaustion=state.exhaustion??0;result.dead=Boolean(state.deathSaves?.dead);
  const suppressedAura = incapacitated ? result.auraOfProtection : 0;
  if (suppressedAura) result.auraOfProtection = 0;
  const aura=wardenPathAuras({
    path:result.paths.warden,level:result.callingLevels.warden,aura:result.auraOfProtection,spiritModifier:result.attributeModifiers.spirit,
    standard:active.some(effect=>effect.covenantStandard),openHarbor:active.some(effect=>effect.openHarbor),dawnSunlight:active.some(effect=>effect.dawnSunlight),
  });
  Object.assign(result,aura.fields);
  if(aura.resistances.length)result.resistances=[...new Set([...result.resistances,...aura.resistances])];
  const penalty=exhaustionD20Penalty(result.exhaustion);
  for(const id of Object.keys(result.skillModifiers))result.skillModifiers[id]-=penalty;
  result.initiative.modifier-=penalty;
  for(const casting of [...Object.values(result.spellcasting),...(result.featSpellcasters??[])])casting.attackModifier-=penalty;
  const equipmentBonus = character && !form ? require('../../equipment/magicProjection').project(result, character) : 0;
  if(result.lineage?.breathes.includes('water'))result.waterBreathing=true;
  if(result.lineage&&result.movement.swim==='walk')result.movement.swim=Math.max(result.movement.walk,result.lineage.movement.swim);
  result.savingThrowModifiers = projectSavingThrowModifiers(result.savingThrowModifiers, {
    suppressedAura, exhaustion: result.exhaustion, equipmentBonus,
  });
  const walkingSpeed=result.movement.walk;
  for(const key of ['walk','fly','swim','climb'])result.movement[key]=exhaustedMovement(result.movement[key], walkingSpeed, result.exhaustion);
  if(active.some(e=>e.steadyAim))for(const key of ['walk','fly','swim','climb'])result.movement[key]=0;
  if(conditionsPreventMovement(result.conditions))for(const key of ['walk','fly','swim','climb'])result.movement[key]=0;
  if (!form) result.senses={...(result.senses??{}),...passiveFeats.senses,...callingSenses(result.paths,result.callingLevels,incapacitated)};
  if (form) {
    result.guard = form.guard;
    result.waterBreathing = form.breathes.includes('water');
  }
  const listening = active.find(effect => effect.stoneListening);
  if (listening) result.stoneListening = { ...listening.stoneListening, expiresAt: listening.expiresAt };
  result.corridorDcBonus=holdTheCorridorDCBonus(active.some(e=>e.corridorDC));
  const abilities=require('../abilities/abilityOptions');
  result.abilityOptions=abilities.list(result).map(option=>{
    const missing=firstMissingAbilityCost(option.costs,state.pools);
    const blocked=incapacitated&&abilityTakesAction(option.action);
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
      if(!stormPulseFollowsCast(last,state.ownerTurn.id))unavailableReason='First record a level-one-or-higher spell on this turn';
      else if(state.counters.tempestPulses?.includes(state.ownerTurn.id))unavailableReason='Storm Pulse already resolved this turn';
    }
    if(!unavailableReason&&option.handler.startsWith('relay-')&&option.handler!=='relay-place'&&!result.activeRelayIds?.length)unavailableReason='Place a live relay first';
    if(!unavailableReason&&option.handler==='barrier-reduce'&&!active.some(e=>e.objectType==='barrier'&&e.health?.current>0))unavailableReason='Place a live barrier first';
    if(!unavailableReason&&['measured-charge','grand-battery'].includes(option.handler)&&character?.inventory&&character?.loadout)unavailableReason=require('../abilities/cinderOperations').unavailableReason(character);
    if(!unavailableReason&&['stormhide-retaliate','reaver-path-hit','stormhide-walking','stormhide-pulse','chainbreaker-kneel','colossus-deck','colossus-suppress'].includes(option.handler)&&!result.raging)unavailableReason='Requires active Rage';
    if(!unavailableReason&&option.handler==='stormhide-pulse'&&!active.some(e=>e.walkingStorm))unavailableReason='Activate Walking Storm first';
    if(!unavailableReason&&['mangrove-hit','mangrove-predator'].includes(option.handler)&&!active.some(e=>e.featureId==='spell:hunter-s-mark'&&e.targets?.length))unavailableReason="Apply Hunter's Mark first";
    if(!unavailableReason&&option.handler==='outrider-passing'){
      const hit=state.ownerTurn?.open?state.ownerTurn.firstWeaponHit:null;
      if(!hit)unavailableReason='Record your first weapon hit this turn';
      else if(!passingShotEligible(hit))unavailableReason='The first hit requires 20 feet of Speed movement and no earlier Recoil';
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
function validateCantrip(choice, grant) {
  if (!choice || typeof choice !== 'object' || Array.isArray(choice) ||
    Object.keys(choice).some(key => !['source', 'spellId'].includes(key)) ||
    !grant?.replacement || choice.source !== grant.grantKey ||
    !callingCantripEligible(rules.spells.find(spell => spell.id === choice.spellId), 'shipwright'))
    fail('Choose an eligible Glasslight cantrip and its Lineage source');
}

module.exports = { project, validateCantrip };
