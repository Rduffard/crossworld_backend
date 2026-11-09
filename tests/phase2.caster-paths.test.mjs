import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands'),ops=require('../src/modules/archipelago/system/rules2024/casterPathOperations');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'caster-path-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
function use(b,handler,parameters={},targets=[],turnId){const option=rules.replay(b.character.rulesLedger).abilityOptions.find(o=>o.handler===handler);assert.ok(option,handler);return run(b,'ability.activate',{optionId:option.id,targetIds:targets,parameters:{confirmed:true,...parameters},...(turnId?{turnId}:{})});}
test('Borrowed Voice is a free own-turn single link and does not displace Concentration',()=>{
  const b=build('tidecaller',3,'memory-echo'),before=b.character.rulesRuntime.pools['memory-echo:echo'];assert.throws(()=>use(b,'echo-link',{},['ally']),/open owner turn/);run(b,'turn.start',{turnId:'one',confirmed:true});b.character.rulesRuntime.effects.push({id:'spell',concentration:true});use(b,'echo-link',{},['ally'],'one');use(b,'echo-link',{},['other'],'one');assert.equal(b.character.rulesRuntime.effects.filter(e=>e.echoVoice).length,1);assert.ok(b.character.rulesRuntime.effects.some(e=>e.id==='spell'));assert.equal(b.character.rulesRuntime.pools['memory-echo:echo'],before);assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).telepathicLinks[0].endsBeyondRange,true);
});
test('Echo save adds one d6 to only a failed Spirit or Instinct save before consequences',()=>{
  const b=build('tidecaller',3,'memory-echo');assert.throws(()=>use(b,'echo-save',{saveAttribute:'might',checkTotal:8,dc:15,eventId:'save'}),/failed eligible/);const r=use(b,'echo-save',{saveAttribute:'spirit',checkTotal:8,dc:15,eventId:'save'});assert.equal(r.checkTotal,8+r.rolls[0]);assert.equal(r.success,r.checkTotal>=15);assert.throws(()=>use(b,'echo-save',{saveAttribute:'spirit',checkTotal:8,dc:15,eventId:'save'}),/already resolved/);
});
test('Recalled Pattern validates the source Enchantment casting and never changes the save',()=>{
  const b=build('tidecaller',6,'memory-echo');b.character.rulesRuntime.castings=[{castId:'charm',spellId:'charm-person',callingId:'tidecaller',targets:['enemy']}];const r=use(b,'echo-pattern',{objectId:'charm',eventId:'save'},['enemy'],'enemy-turn');assert.equal(r.saveUnchanged,true);assert.equal(r.movement.provokesOpportunityAttacks,false);assert.equal(r.revealCharmedImmunity.targetId,'enemy');assert.throws(()=>use(b,'echo-pattern',{objectId:'charm',eventId:'other'},['enemy'],'enemy-turn'),/already resolved/);assert.throws(()=>use(b,'echo-pattern',{objectId:'charm',eventId:'third'},['unrelated'],'later'),/recorded Enchantment/);
});
test('Shared Recollection replaces Concentration, lasts an hour and caps all participants at Training',()=>{
  const b=build('tidecaller',14,'memory-echo');b.character.rulesRuntime.effects=[{id:'prior',concentration:true}];const r=use(b,'echo-share',{},['self','ally']);assert.equal(r.effect.expiresAt-r.effect.createdAt,3600000);assert.equal(r.effect.telepathy.rangeFeet,5280);assert.deepEqual(r.effect.telepathy.participants,['self','ally']);assert.equal(b.character.rulesRuntime.effects.length,1);assert.throws(()=>use(b,'echo-share',{},Array.from({length:b.summary.trainingBonus+1},(_,i)=>'ally'+i)),/Training Bonus/);
});
test('Recalled Pattern rejects a saved Enchantment with no saving throw without changing state',()=>{
  const b=build('tidecaller',20,'memory-echo');
  b.character.rulesRuntime.preparations.tidecaller[0]='power-word-kill';
  const cast=run(b,'spell.cast',{spellId:'power-word-kill',callingId:'tidecaller',slotLevel:9,targets:['recipient']});
  const before=structuredClone(b.character);
  assert.throws(()=>use(b,'echo-pattern',{objectId:cast.castId,eventId:'save'},['recipient'],'enemy-turn'),/with a saving throw/);
  assert.deepEqual(b.character,before);
});
test('Unwritten Self changes an unresolved eligible save and ends exactly one real source',()=>{
  const b=build('tidecaller',18,'memory-echo');b.character.rulesRuntime.conditions=[{conditionId:'charmed',source:'a'},{conditionId:'charmed',source:'b'}];const hp=b.character.rulesRuntime.health.current,r=use(b,'echo-unwritten',{saveAttribute:'wit',checkTotal:3,dc:15,eventId:'save',mode:'charmed',conditionSource:'a'});assert.equal(r.saveSucceedsInstead,true);assert.deepEqual(b.character.rulesRuntime.conditions,[{conditionId:'charmed',source:'b'}]);assert.equal(b.character.rulesRuntime.health.current,hp);assert.equal(b.character.rulesRuntime.pools['memory-echo:unwritten'],0);
});
test('Storm Pulse validates the latest same-turn levelled casting and carries an ally only at fourteen',()=>{
  const b=build('tidecaller',14,'tempest-heart');run(b,'turn.start',{turnId:'one',confirmed:true});b.character.rulesRuntime.castings=[{castId:'cast',slotLevel:1,turnId:'one'}];const r=use(b,'tempest-pulse',{objectId:'cast',targetId:'passenger'},['enemy'],'one');assert.equal(r.damage,Math.max(1,b.summary.attributeModifiers.spirit));assert.equal(r.movement.carriedTargetId,'passenger');assert.equal(r.movement.provokesOpportunityAttacks,false);assert.throws(()=>use(b,'tempest-pulse',{objectId:'cast'},['enemy'],'one'),/already resolved/);
});
test('Conductive conversion applies only to the next Tidecaller spell and expires at owner-turn end',()=>{
  const b=build('tidecaller',6,'tempest-heart');run(b,'turn.start',{turnId:'one',confirmed:true});use(b,'tempest-convert',{damageType:'thunder'},[],'one');const state=b.character.rulesRuntime,management={damageTypes:['lightning','fire']};ops.convert(state,b.summary,{callingId:'tidecaller',turnId:'one'},management);assert.deepEqual(management.damageTypes,['thunder','fire']);assert.equal(state.effects.some(e=>e.tempestConversion),false);use(b,'tempest-convert',{damageType:'lightning'},[],'one');run(b,'turn.end',{turnId:'one',confirmed:true});assert.equal(b.character.rulesRuntime.effects.some(e=>e.tempestConversion),false);
});
test('Conductive conversion is forfeited when the next spell already deals only the selected storm type',()=>{
  const b=build('tidecaller',6,'tempest-heart');run(b,'turn.start',{turnId:'one',confirmed:true});use(b,'tempest-convert',{damageType:'thunder'},[],'one');
  const management={damageTypes:['thunder','fire']};ops.convert(b.character.rulesRuntime,b.summary,{callingId:'tidecaller',turnId:'one'},management);
  assert.deepEqual(management.damageTypes,['thunder','fire']);assert.equal(management.conductiveConversion.forfeited,true);assert.equal(b.character.rulesRuntime.effects.some(e=>e.tempestConversion),false);
});

test('Conductive damage bonus applies to one matching spell roll once per damage turn',()=>{
  const b=build('tidecaller',6,'tempest-heart'),type=b.summary.pathSelections.tidecaller.pathDiscipline;b.character.rulesRuntime.castings=[{castId:'cast',callingId:'tidecaller',management:{damageTypes:[type]}}];const r=use(b,'tempest-damage',{objectId:'cast'},[],'enemy-turn');assert.equal(r.damage,b.summary.attributeModifiers.spirit);assert.equal(r.singleDamageRoll,true);assert.throws(()=>use(b,'tempest-damage',{objectId:'cast'},[],'enemy-turn'),/already applied/);
});
test('Living Tempest grants real immunity and opposite Resistance for one minute',()=>{
  const b=build('tidecaller',18,'tempest-heart'),r=use(b,'tempest-live'),s=rules.runtime.project(b.summary,b.character.rulesRuntime),type=b.summary.pathSelections.tidecaller.pathDiscipline;assert.equal(r.effect.expiresAt-r.effect.createdAt,60000);assert.equal(s.movement.fly,60);assert.ok(s.immunities.includes(type));assert.equal(run(b,'health.damage',{amount:20,damageType:type,confirmed:true}).damage,0);assert.equal(run(b,'health.damage',{amount:20,damageType:type==='lightning'?'thunder':'lightning',confirmed:true}).damage,10);
});
