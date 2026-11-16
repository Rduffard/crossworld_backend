import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from '../helpers/phase2.mjs';
import {build as buildBare,scores} from '../helpers/rules2024.mjs';
const require=createRequire(import.meta.url);
const equipment=require('../../src/modules/archipelago/equipment');
const {reconcile}=require('../../src/modules/archipelago/characters/persistence');

test('four Path resources unlock at level 3 and increase at the same thresholds', () => {
  const cases = [
    ['shipwright', 'drydock-ghost', 'ghost-work', 'powder-saint'],
    ['navigator', 'storm-broker', 'squall', 'gray-net'],
    ['doctor', 'field-surgeon', 'triage', 'sanctuary-hand'],
    ['shipwright', 'breakwater', 'bastion', 'powder-saint'],
  ];
  const capacities = [
    [1, undefined], [2, undefined], [3, 2], [4, 2], [6, 2], [7, 3],
    [10, 3], [11, 4], [14, 4], [15, 5], [18, 5], [19, 6], [20, 6],
  ];
  const unrelated = build('gunslinger', 3).summary;
  for (const [calling, path, key, alternate] of cases) {
    const { ledger } = build(calling, 20, path);
    const id = path + ':' + key;
    for (const [level, max] of capacities) {
      const { resources } = rules.replay({ ...ledger, levels: ledger.levels.slice(0, level) });
      assert.deepEqual(resources[id], max === undefined ? undefined : {
        id, max, recovery: { longRest: 'all', shortRest: 1 },
      }, path + ' at level ' + level);
    }
    const levels = structuredClone(ledger.levels.slice(0, 3));
    levels[2].choices = {};
    const missingPath = rules.replay({ ...ledger, levels });
    assert.equal(missingPath.decisionsComplete, false);
    assert.equal(missingPath.resources[id], undefined);
    assert.equal(build(calling, 3, alternate).summary.resources[id], undefined);
    assert.equal(unrelated.resources[id], undefined);
    assert.throws(() => rules.replay({ ...ledger, levels: [] }), /Character level must be 1-20/);
    assert.throws(() => rules.replay({ ...ledger, levels: [...ledger.levels, ledger.levels[19]] }),
      /Character level must be 1-20/);
  }
});

test('earned Health and Hit Dice follow fixed gains, Path bonuses, and retroactive Resolve',()=>{
  for(const [calling,level,path,resolve,max,hitDice] of [
    ['tidecaller',1,undefined,15,8,{d6:1}],
    ['tidecaller',2,undefined,15,14,{d6:2}],
    ['tidecaller',3,'omen-diver',15,23,{d6:3}],
    ['tidecaller',3,'memory-echo',15,20,{d6:3}],
    ['reaver',19,'bloodwake',15,176,{d12:19}],
    ['reaver',20,'bloodwake',19,225,{d12:20}],
  ]){
    const {summary}=build(calling,level,path);
    assert.equal(summary.attributes.resolve,resolve);
    assert.deepEqual(summary.health,{max});
    assert.deepEqual(summary.hitDice,hitDice);
  }
  const {rulesLedger}=buildBare('tidecaller',2,{...scores,resolve:3});
  assert.deepEqual(rules.replay(rulesLedger).health,{max:3});
});

test('Doctor Health preserves damage across fixed advancement and a higher Resolve modifier',()=>{
  const first=build('doctor',1),second=build('doctor',2);
  assert.equal(first.summary.health.max,10);
  assert.equal(second.summary.health.max,17);
  const damaged={...first.character.rulesRuntime,health:{current:6,max:10}};
  const advanced=reconcile(damaged,first.summary,second.summary);
  assert.deepEqual(advanced.health,{current:13,max:17});
  const higherResolve=structuredClone(second.ledger);
  higherResolve.creation.increases={resolve:1,might:1};
  const after=rules.replay(higherResolve);
  assert.equal(after.attributes.resolve,16);
  assert.deepEqual(reconcile(advanced,second.summary,after).health,{current:15,max:19});
});

test('Second Wind retains two spent uses when its maximum grows from two to three',()=>{
  const {summary,character}=build('gunslinger',3),next=build('gunslinger',4).summary;
  const pool='gunslinger:second-wind';
  assert.equal(summary.resources[pool].max,2);
  assert.equal(next.resources[pool].max,3);
  character.rulesRuntime.pools[pool]=0;
  assert.equal(reconcile(character.rulesRuntime,summary,next).pools[pool],1);
});

test('Rage recovers one of three on a Short Rest and all three with Hit Dice on a Long Rest',()=>{
  const {summary,character}=build('reaver',3);
  const state=character.rulesRuntime;
  state.pools['reaver:rage']=0;
  state.hitDice.d12=0;
  const short=rules.runtime.update(summary,state,{type:'short-rest',expectedRevision:state.revision});
  assert.equal(short.pools['reaver:rage'],1);
  assert.equal(short.hitDice.d12,0);
  const long=rules.runtime.update(summary,short,{type:'long-rest',expectedRevision:short.revision});
  assert.equal(long.pools['reaver:rage'],3);
  assert.equal(long.hitDice.d12,3);
});

test('level-five longbow with Archery and studded leather has exact attack, damage and Guard',()=>{
  const b=build('gunslinger',5);
  b.ledger.levels[3].choices.increases={agility:1,might:1};
  const summary=rules.replay(b.ledger);
  const bow=equipment.issue({definitionId:'longbow'});
  const armor=equipment.issue({definitionId:'studded-leather-armor'});
  const shield=equipment.issue({definitionId:'shield'});
  const character={...b.character,rulesLedger:b.ledger,rulesRuntime:rules.runtime.initialize(summary),
    inventory:[bow,armor,shield],loadout:{mainHand:bow.instanceId,offHand:null,armor:armor.instanceId,grip:'two'}};
  const derived=equipment.derive(character);
  assert.equal(summary.attributes.agility,16);
  assert.equal(derived.guard,15);
  const [attack]=derived.attacks;
  assert.equal(attack.attackModifier,8);
  assert.equal(attack.damageModifier,3);
  assert.equal(attack.weapon.damage.count,1);
  assert.equal(attack.weapon.damage.sides,8);
  assert.throws(()=>equipment.derive({...character,loadout:{...character.loadout,offHand:shield.instanceId}}),/occupied hand|grip/);
});

test('Omen Diver Health and unarmored Guard scale at levels three and four',()=>{
  for(const level of [3,4]){
    const omen=build('tidecaller',level,'omen-diver'),other=build('tidecaller',level,'memory-echo');
    assert.equal(omen.summary.health.max-other.summary.health.max,level);
    const character={...omen.character,loadout:{mainHand:null,offHand:null,armor:null,grip:'one'}};
    assert.equal(equipment.derive(character).guard,13);
  }
});

test('Third-level full casting and first-level Warden have their independent slot and preparation limits',()=>{
  const full=build('tidecaller',3).summary,warden=build('warden',1).summary;
  assert.deepEqual(full.spellSlots,[4,2]);
  assert.deepEqual(warden.spellSlots,[2]);
  assert.equal(warden.spellcasting.warden.prepared.length,2);
  assert.ok(full.spellcasting.tidecaller.prepared.every(id=>rules.blueprint.spells.find(s=>s.id===id).level<=2));
});

test('Stealth Training and Expertise at level five produce +6 and +9 with Agility 16',()=>{
  const b=build('corsair',5,'reef-knife','yuma-core','free-agent');
  b.ledger.creation.increases={wit:2};
  b.ledger.levels[3].choices.increases={agility:1,might:1};
  const trained=rules.replay(b.ledger);
  assert.equal(trained.attributes.agility,16);
  assert.equal(trained.skillModifiers.stealth,6);
  b.ledger.levels[0].choices.expertise=['acrobatics','stealth'];
  assert.equal(rules.replay(b.ledger).skillModifiers.stealth,9);
});

test('one Sorcery Point cannot create a level-one slot and rejection preserves state',()=>{
  const {summary,character}=build('tidecaller',2);
  const state=character.rulesRuntime;
  state.pools['tidecaller:sorcery-points']=1;
  const before=structuredClone(state);
  assert.throws(()=>rules.runtime.update(summary,state,{type:'sorcery-to-slot',slotLevel:1,expectedRevision:state.revision}),/Insufficient Sorcery Points/);
  assert.deepEqual(state,before);
});

test('Powder Saint requires Savant picks at unlock and each later spell-tier boundary',()=>{
  const {ledger}=build('shipwright',20,'powder-saint');
  const expected=new Map([[3,2],[5,1],[7,1],[9,1],[11,1],[13,1],[15,1],[17,1]]);
  for(const [index,event] of ledger.levels.entries()){
    const level=index+1,grants=event.choices.savant??[];
    assert.equal(grants.length,expected.get(level)??0,`level ${level}`);
    if(!expected.has(level))continue;
    const partial=structuredClone(ledger);
    partial.levels.length=level;
    delete partial.levels[index].choices.savant;
    delete partial.levels[index].choices.prepared;
    const request=rules.replay(partial).requiredChoices.find(choice=>choice.key==='savant');
    assert.equal(request.count,expected.get(level));
    assert.ok(grants.every(id=>request.options.includes(id)));
    assert.ok(request.options.every(id=>rules.blueprint.spells.find(spell=>spell.id===id).school==='evocation'));
  }
});

test('Deadeye practice weapon attacks double dice on a natural 19 at three and natural 18 at fifteen',()=>{
  const {fromCharacter}=require('../../src/modules/archipelago/combat/snapshot');
  const {applyCommand}=require('../../src/modules/archipelago/combat/state');
  for(const [level,roll,expected] of [[3,18,'hit'],[3,19,'critical'],[15,18,'critical']]){
    const {character}=build('gunslinger',level,'deadeye');
    const weapon=equipment.issue({definitionId:'cutlass'});
    const equipped={...character,_id:'111111111111111111111111',owner:'owner',inventory:[weapon],
      loadout:{mainHand:weapon.instanceId,offHand:null,armor:null,grip:'one'}};
    const state=JSON.parse(JSON.stringify(fromCharacter(equipped,'owner')));
    const after=applyCommand(state,{id:'deadeye-test',expectedRevision:0,type:'attack',actor:'player',target:'enemy',weapon:weapon.instanceId},
      'owner',sides=>sides===20?roll:2);
    assert.equal(after.events[0].result,expected);
    assert.equal(after.events[0].damageDice.length,expected==='critical'?2:1);
  }
});
