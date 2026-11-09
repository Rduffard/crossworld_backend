import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function run(b,type,payload){const r=commands.apply(b.character,{operationId:'base-passive-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload});b.character={...b.character,...r.changes};return r.result;}
test('Evasion applies before Resistance, succeeds for zero, fails for half and disables while Incapacitated',()=>{
  const b=build('corsair',7,'reef-knife'),max=b.character.rulesRuntime.health.max;let r=run(b,'health.damage',{amount:15,damageType:'fire',agilityHalfSave:'success',confirmed:true});assert.equal(r.damage,0);assert.equal(r.evasionApplied,true);r=run(b,'health.damage',{amount:15,damageType:'fire',agilityHalfSave:'failure',confirmed:true});assert.equal(r.damage,7);b.character.rulesRuntime.health.current=max;b.character.rulesRuntime.conditions=[{conditionId:'incapacitated',source:'spell'}];r=run(b,'health.damage',{amount:15,damageType:'fire',agilityHalfSave:'success',confirmed:true});assert.equal(r.evasionApplied,false);assert.equal(r.damage,7);
});
test('ordinary Agility half-damage saves are not given Evasion before level seven',()=>{
  const b=build('corsair',6,'reef-knife');assert.equal(run(b,'health.damage',{amount:15,damageType:'fire',agilityHalfSave:'failure',confirmed:true}).damage,15);assert.equal(run(b,'health.damage',{amount:15,damageType:'fire',agilityHalfSave:'success',confirmed:true}).damage,7);
});
test('Danger Sense and Elusive reflect Incapacitation, while Feral Senses projects its thirty-foot Blindsight',()=>{
  const b=build('reaver',2);assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).agilitySaveAdvantage,true);b.character.rulesRuntime.conditions=[{conditionId:'stunned',source:'spell'}];assert.equal(rules.runtime.project(b.summary,b.character.rulesRuntime).agilitySaveAdvantage,false);const c=build('corsair',18,'reef-knife');assert.equal(rules.runtime.project(c.summary,c.character.rulesRuntime).elusive,true);c.character.rulesRuntime.health.current=0;assert.equal(rules.runtime.project(c.summary,c.character.rulesRuntime).elusive,false);const n=build('navigator',18,'gray-net');assert.equal(rules.runtime.project(n.summary,n.character.rulesRuntime).senses.blindsight,30);
});
test('Reliable Talent affects actual trained tool checks, and Indomitable Might floors real Might checks',()=>{
  const b=build('corsair',7,'reef-knife'),tool=b.character.inventory.find(i=>i.definitionId==='thieves-tools');assert.ok(tool);for(let i=0;i<12;i++){const r=run(b,'tool.check',{instanceId:tool.instanceId,eventId:'lock-'+i,attribute:'agility',confirmed:true});assert.ok(r.total>=10+r.modifier);assert.equal(r.appliedRoll,Math.max(10,r.naturalRoll));}
  const r=build('reaver',18,'bloodwake'),gear=require('../src/modules/archipelago/equipment'),item=gear.issue({definitionId:'thieves-tools'});r.character.inventory.push(item);const check=run(r,'tool.check',{instanceId:item.instanceId,eventId:'might-lock',attribute:'might',confirmed:true});assert.ok(check.total>=r.summary.attributes.might);
});
test('Precise Hunter uses only the actual live marked targets',()=>{
  const b=build('navigator',17,'gray-net');b.character.rulesRuntime.effects.push({id:'mark',featureId:'spell:hunter-s-mark',targets:['foe'],concentration:true});assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).preciseHunterTargetIds,['foe']);run(b,'effect.end',{effectId:'mark'});assert.deepEqual(rules.runtime.project(b.summary,b.character.rulesRuntime).preciseHunterTargetIds,[]);
});

test('Deadeye Survivor revives on an eighteen death save and Heroic Rally heals only a living Bloodied owner turn',()=>{
  const b=build('gunslinger',18,'deadeye');b.character.rulesRuntime.health.current=0;const r=run(b,'death-save.roll',{naturalRoll:18,confirmed:true});assert.equal(r.defyDeath,true);assert.equal(b.character.rulesRuntime.health.current,1);run(b,'turn.start',{turnId:'one',confirmed:true});assert.equal(b.character.rulesRuntime.health.current,1+5+b.summary.attributeModifiers.resolve);run(b,'turn.end',{turnId:'one',confirmed:true});b.character.rulesRuntime.health.current=b.character.rulesRuntime.health.max;const no=run(b,'turn.start',{turnId:'two',confirmed:true});assert.equal(no.heroicRally,undefined);
});
test('Restoring Touch spends five Lay On Hands per eligible condition and never refunds absent sources as healing',()=>{
  const b=build('warden',14,'iron-covenant');b.character._id='self';b.character.rulesRuntime.conditions=[{conditionId:'blinded',source:'a'},{conditionId:'deafened',source:'b'}];const option=b.summary.abilityOptions.find(o=>o.handler==='warden-touch'),pool=b.character.rulesRuntime.pools['warden:lay-on-hands'],hp=b.character.rulesRuntime.health.current;run(b,'ability.activate',{optionId:option.id,targetIds:['self'],parameters:{conditions:['blinded','deafened'],confirmed:true}});assert.equal(b.character.rulesRuntime.pools['warden:lay-on-hands'],pool-10);assert.deepEqual(b.character.rulesRuntime.conditions,[]);assert.equal(b.character.rulesRuntime.health.current,hp);assert.throws(()=>run(b,'ability.activate',{optionId:option.id,targetIds:['self'],parameters:{conditions:['poisoned'],confirmed:true}}),/eligible conditions/);
});
test('Mindless Rage ends existing Charmed/Frightened and rejects those conditions while Rage remains active',()=>{
  const b=build('reaver',6,'bloodwake');b.character.rulesRuntime.conditions=[{conditionId:'charmed',source:'spell'},{conditionId:'frightened',source:'dragon'}];const option=b.summary.abilityOptions.find(o=>o.handler==='rage');run(b,'ability.activate',{optionId:option.id});assert.deepEqual(b.character.rulesRuntime.conditions,[]);assert.throws(()=>run(b,'condition.record',{conditionId:'charmed',source:'new-spell',active:true,confirmed:true}),/Immunity/);
});
test('Sanctuary Supreme Healing maximizes Divine Spark healing dice at seventeen',()=>{
  const b=build('doctor',17,'sanctuary-hand'),option=b.summary.abilityOptions.find(o=>o.handler==='spark-heal'),r=run(b,'ability.activate',{optionId:option.id,targetIds:['ally'],parameters:{confirmed:true}});assert.deepEqual(r.rolls,[8,8,8]);assert.equal(r.healing,24+b.summary.attributeModifiers.instinct);
});
