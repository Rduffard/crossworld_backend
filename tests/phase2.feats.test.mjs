import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),gear=require('../src/modules/archipelago/equipment');
function command(b,type,payload){const next=commands.apply(b.character,{operationId:'feat-operation-001',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...next.changes};return next.result;}
function feat(id,calling='gunslinger',n=19,attribute='spirit',background='deckhand'){
  const b=build(calling,n,undefined,'yuma-core',background);b.ledger.levels[n-1].choices.feat=id;b.ledger.levels[n-1].choices.increases={[attribute]:1};b.summary=rules.replay(b.ledger);assert.equal(b.summary.decisionsComplete,true);
  b.character={...b.character,rulesLedger:b.ledger,attributes:b.summary.attributes,rulesRuntime:rules.runtime.initialize(b.summary)};return b;
}
function use(b,id,parameters={},extra={}){return command(b,'feat.use',{featId:id,eventId:'event-one',confirmed:true,parameters,...extra});}
test('Inspiration is Boolean, nonstacking, spends once and saves a replacement die',()=>{
  const b=build('corsair');command(b,'inspiration.grant',{confirmed:true});command(b,'inspiration.grant',{confirmed:true});assert.equal(b.character.rulesRuntime.inspiration,true);
  const r=command(b,'inspiration.spend',{confirmed:true,eventId:'roll-one',sides:12,originalRoll:1});assert.ok(r.roll>=1&&r.roll<=12);assert.equal(r.mustUseNewRoll,true);assert.equal(b.character.rulesRuntime.inspiration,false);
  const before=structuredClone(b.character);assert.throws(()=>command(b,'inspiration.spend',{confirmed:true,eventId:'roll-one',sides:12,originalRoll:1}),/No Heroic/);assert.deepEqual(b.character,before);
});
test('Deadeye Heroic Warrior refreshes Inspiration at each combat turn start but does not bank extra uses',()=>{
  const b=build('gunslinger',10,'deadeye');command(b,'initiative.record',{combatId:'battle-one',roll:10,confirmed:true});
  command(b,'turn.start',{turnId:'first',confirmed:true});assert.equal(b.character.rulesRuntime.inspiration,true);
  command(b,'inspiration.spend',{eventId:'roll',sides:20,originalRoll:1,confirmed:true});command(b,'turn.end',{turnId:'first',confirmed:true});command(b,'turn.start',{turnId:'second',confirmed:true});assert.equal(b.character.rulesRuntime.inspiration,true);
  command(b,'turn.end',{turnId:'second',confirmed:true});command(b,'scene.record',{light:'bright',inCombat:false,confirmed:true});command(b,'inspiration.spend',{eventId:'other',sides:20,originalRoll:1,confirmed:true});command(b,'turn.start',{turnId:'outside',confirmed:true});assert.equal(b.character.rulesRuntime.inspiration,false);
});
test('Savage Attacker rolls weapon dice twice, excludes riders and rejects repeated use on a labelled turn',()=>{
  const b=build('gunslinger',3),weapon=b.character.inventory.find(i=>i.definitionId==='greatsword');b.character.loadout.mainHand=weapon.instanceId;b.character.loadout.grip='two';
  const r=use(b,'savage-attacker',{weaponId:weapon.instanceId},{turnId:'turn-one'});assert.deepEqual(r.rolls.map(x=>x.length),[2,2]);assert.equal(r.weaponDiceTotal,Math.max(...r.totals));assert.equal(r.riderDiceIncluded,false);
  const before=structuredClone(b.character);assert.throws(()=>use(b,'savage-attacker',{weaponId:weapon.instanceId},{turnId:'turn-one',eventId:'another-hit'}),/unused confirmed turn/);assert.deepEqual(b.character,before);
});
test('Alert swaps recorded Initiative only once for a confirmed willing ally; unknown feats fail atomically',()=>{
  const b=build('doctor',3,undefined,'yuma-core','field-medic');command(b,'initiative.record',{combatId:'combat',roll:10,confirmed:true});const original=b.character.rulesRuntime.initiative.total;
  const r=use(b,'alert',{allyTotal:18,consent:true},{targetIds:['table-ally']});assert.equal(r.swap.allyReceives,original);assert.equal(b.character.rulesRuntime.initiative.total,18);
  assert.throws(()=>use(b,'alert',{allyTotal:20,consent:true},{eventId:'second',targetIds:['other']}),/already used/);
  const before=structuredClone(b.character);assert.throws(()=>use(b,'boon-of-fate'),/known feat/);assert.deepEqual(b.character,before);
});
test('Savage Attacker uses the saved owner or external turn and rejects fabricated turn labels',()=>{
  const b=build('gunslinger',3),weapon=b.character.inventory.find(i=>i.definitionId==='greatsword');
  b.character.loadout.mainHand=weapon.instanceId;b.character.loadout.grip='two';
  const parameters={weaponId:weapon.instanceId};
  command(b,'scene.record',{light:'bright',inCombat:true,confirmed:true});
  assert.throws(()=>use(b,'savage-attacker',parameters,{turnId:'invented'}),/recorded encounter turn/);
  command(b,'turn.start',{turnId:'owner',confirmed:true});
  use(b,'savage-attacker',parameters);
  const before=structuredClone(b.character);
  assert.throws(()=>use(b,'savage-attacker',parameters,{eventId:'other',turnId:'invented'}),/recorded encounter turn/);
  assert.throws(()=>use(b,'savage-attacker',parameters,{eventId:'other'}),/unused confirmed turn/);
  assert.deepEqual(b.character,before);
  command(b,'turn.end',{turnId:'owner',confirmed:true});
  command(b,'turn.external',{turnId:'enemy',confirmed:true});
  assert.doesNotThrow(()=>use(b,'savage-attacker',parameters,{eventId:'enemy-hit'}));
});
test('Peerless Aim causes a hit rather than a natural twenty and refreshes only at next owner turn',()=>{
  const b=feat('boon-of-combat-prowess');const r=use(b,'boon-of-combat-prowess');assert.equal(r.hitInstead,true);assert.equal(r.naturalTwenty,false);
  assert.throws(()=>use(b,'boon-of-combat-prowess',{}, {eventId:'other'}),/next turn/);
  command(b,'turn.start',{turnId:'my-next-turn',confirmed:true});assert.doesNotThrow(()=>use(b,'boon-of-combat-prowess',{}, {eventId:'third'}));
});
test('Improve Fate saves its signed 2d4 and recovers on Initiative or either rest',()=>{
  const b=feat('boon-of-fate'),r=use(b,'boon-of-fate',{total:15,sign:'penalty'},{targetIds:['foe']});assert.ok(r.adjustment<=-2&&r.adjustment>=-8);assert.equal(r.total,15+r.adjustment);
  assert.throws(()=>use(b,'boon-of-fate',{total:15,sign:'bonus'},{targetIds:['ally'],eventId:'other'}),/available use/);
  command(b,'initiative.record',{combatId:'new-combat',confirmed:true});use(b,'boon-of-fate',{total:15,sign:'bonus'},{targetIds:['ally'],eventId:'after-initiative'});
  for(const type of ['short-rest','long-rest']){b.character.rulesRuntime=rules.runtime.update(b.summary,b.character.rulesRuntime,{type,expectedRevision:b.character.rulesRuntime.revision});assert.doesNotThrow(()=>use(b,'boon-of-fate',{total:15,sign:'bonus'},{targetIds:['ally'],eventId:'after-'+type}));}
});
test('Night Spirit projects only its allowed resistances in darkness and ends invisibility on action or bright light',()=>{
  const b=feat('boon-of-the-night-spirit');assert.throws(()=>use(b,'boon-of-the-night-spirit'),/Dim Light/);
  command(b,'scene.record',{light:'dark',inCombat:true,confirmed:true});use(b,'boon-of-the-night-spirit');let s=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.ok(s.conditions.includes('invisible'));assert.ok(s.resistances.includes('fire'));assert.ok(!s.resistances.includes('psychic'));assert.ok(!s.resistances.includes('radiant'));
  command(b,'action.record',{action:'reaction',confirmed:true});assert.ok(!rules.runtime.project(b.summary,b.character.rulesRuntime).conditions.includes('invisible'));
  use(b,'boon-of-the-night-spirit',{}, {eventId:'merge-again'});command(b,'scene.record',{light:'bright',inCombat:true,confirmed:true});s=rules.runtime.project(b.summary,b.character.rulesRuntime);assert.ok(!s.conditions.includes('invisible'));assert.ok(!s.resistances.includes('fire'));
});
test('Dimensional Travel enforces immediate action provenance and a thirty-foot visible destination',()=>{
  const b=feat('boon-of-dimensional-travel');assert.throws(()=>use(b,'boon-of-dimensional-travel',{trigger:'attack',distanceFeet:31}),/within 30/);
  assert.equal(use(b,'boon-of-dimensional-travel',{trigger:'magic',distanceFeet:25}).teleportFeet,25);
  assert.throws(()=>use(b,'boon-of-dimensional-travel',{trigger:'magic',distanceFeet:25}),/already been resolved/);
});
test('Irresistible Offense uses the attribute increased by its own grant and preserves attack damage type',()=>{
  const b=feat('boon-of-irresistible-offense','gunslinger',19,'agility');const r=use(b,'boon-of-irresistible-offense',{naturalRoll:20,damageType:'piercing'},{targetIds:['foe']});assert.equal(r.extraDamage,b.summary.attributes.agility);assert.equal(r.damageType,'piercing');assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).ignoresPhysicalResistance,true);
});
test('Field Responder consumes one real kit charge and stabilizes without healing; no kits refill on rest',()=>{
  const b=feat('field-responder','doctor',4,'instinct','field-medic'),kit=b.character.inventory.find(i=>i.definitionId==='healer-kit');const r=use(b,'field-responder',{kitId:kit.instanceId},{targetIds:['ally']});assert.equal(r.stabilize,true);assert.equal(r.healing,undefined);assert.equal(b.character.inventory.find(i=>i.instanceId===kit.instanceId).chargesCurrent,9);
  b.character.rulesRuntime=rules.runtime.update(b.summary,b.character.rulesRuntime,{type:'long-rest',expectedRevision:b.character.rulesRuntime.revision});assert.equal(b.character.inventory.find(i=>i.instanceId===kit.instanceId).chargesCurrent,9);
});
test('Harbor Defender reduces confirmed attack damage by Training before Resistance',()=>{
  const b=feat('harbor-defender','warden',4,'resolve');const r=use(b,'harbor-defender',{incomingDamage:11},{targetIds:['ally']});assert.equal(r.damageReduction,b.summary.trainingBonus);assert.equal(r.remainingDamage,11-b.summary.trainingBonus);
});
test('Punch and Grab requires own active turn, adds the Grapple choice and enforces one use',()=>{
  const b=feat('grappler','gunslinger',4,'agility');assert.throws(()=>use(b,'grappler',{}, {targetIds:['foe'],turnId:'my-turn'}),/active turn/);command(b,'turn.start',{turnId:'my-turn',confirmed:true});
  const r=use(b,'grappler',{}, {targetIds:['foe'],turnId:'my-turn'});assert.equal(r.grapple.dc,8+b.summary.trainingBonus+b.summary.attributeModifiers.might);assert.equal(r.grapple.alsoDamage,true);
  assert.throws(()=>use(b,'grappler',{}, {eventId:'other-hit',targetIds:['foe'],turnId:'my-turn'}),/unused confirmed turn/);
});
test('feat and Inspiration state survive serialize/reload and advancement reconciliation',()=>{
  const b=feat('boon-of-fate');command(b,'inspiration.grant',{confirmed:true});use(b,'boon-of-fate',{total:10,sign:'bonus'},{targetIds:['ally']});
  const reloaded=JSON.parse(JSON.stringify(b.character));assert.equal(reloaded.rulesRuntime.inspiration,true);const before=rules.replay(reloaded.rulesLedger),after=rules.replay({...reloaded.rulesLedger,levels:[...reloaded.rulesLedger.levels,build('gunslinger',20).ledger.levels[19]]});
  const reconciled=require('../src/modules/archipelago/characters/rules2024').reconcile(reloaded.rulesRuntime,before,after);assert.deepEqual(reconciled.featState,reloaded.rulesRuntime.featState);assert.equal(reconciled.inspiration,true);assert.doesNotThrow(()=>gear.validateInventory(reloaded.inventory));
});
