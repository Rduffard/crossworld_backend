import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const equipment=require('../src/modules/archipelago/equipment');
const {reconcile}=require('../src/modules/archipelago/characters/rules2024');

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
  const {fromCharacter}=require('../src/modules/archipelago/combat/snapshot');
  const {applyCommand}=require('../src/modules/archipelago/combat/state');
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
