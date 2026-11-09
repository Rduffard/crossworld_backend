import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from './helpers/phase2.mjs';
const require=createRequire(import.meta.url),commands=require('../src/modules/archipelago/characters/commands');
function run(b,type,payload,context={}){const r=commands.apply(b.character,{operationId:'rebuild-command',rulesVersion:'SA-CHAR-1',expectedRevision:b.character.documentRevision,type,payload},context);b.character={...b.character,...r.changes};return r.result;}
test('rebuild previews full choices without granting levels or changing saved mechanics',()=>{
  const b=build('gunslinger',3,'iron-suppressor'),next=build('gunslinger',3,'brass-outrider'),ledger=structuredClone(b.character.rulesLedger),r=run(b,'rebuild.preview',{ledger:next.ledger,reason:'Change specialization'});assert.equal(r.complete,true);assert.deepEqual(b.character.rulesLedger,ledger);assert.ok(r.consequences.newPoolsStartEmpty);assert.throws(()=>run(b,'rebuild.preview',{ledger:build('gunslinger',4,'brass-outrider').ledger,reason:'More levels'}),/additional levels/);
});
test('campaign commit requires exact registered GM approval and acknowledges resource consequences',()=>{
  const b=build('gunslinger',3,'iron-suppressor');b.character.campaignId='campaign';const r=run(b,'rebuild.preview',{ledger:build('gunslinger',3,'brass-outrider').ledger,reason:'Specialize'});assert.throws(()=>run(b,'rebuild.approve',{proposalId:r.proposalId}),/campaign GM/);assert.throws(()=>run(b,'rebuild.commit',{proposalId:r.proposalId,acceptConsequences:true}),/GM must approve/);run(b,'rebuild.approve',{proposalId:r.proposalId},{gmAllowed:true,userId:'gm'});assert.throws(()=>run(b,'rebuild.commit',{proposalId:r.proposalId}),/Accept/);const committed=run(b,'rebuild.commit',{proposalId:r.proposalId,acceptConsequences:true});assert.equal(committed.approvedBy,'gm');assert.equal(b.character.rulesLedger.levels[2].choices.pathId[0],'brass-outrider');assert.equal(b.character.rulesRuntime.pools['brass-outrider:outrider'],0);assert.equal(b.character.rulesRuntime.rebuildProposal,undefined);
});
test('a changed character invalidates approval and requires a fresh rebuild preview',()=>{
  const b=build('gunslinger',3,'iron-suppressor'),r=run(b,'rebuild.preview',{ledger:build('gunslinger',3,'brass-outrider').ledger,reason:'Change'});run(b,'health.damage',{amount:1,damageType:'force',confirmed:true});assert.throws(()=>run(b,'rebuild.commit',{proposalId:r.proposalId,acceptConsequences:true}),/changed after/);
});
test('solo rebuild preserves expenditure and possessions while ending temporary effects and never healing',()=>{
  const b=build('gunslinger',6,'iron-suppressor'),next=build('gunslinger',6,'brass-outrider');b.character.rulesRuntime.health.current=7;b.character.rulesRuntime.pools['gunslinger:second-wind']=0;b.character.rulesRuntime.hitDice.d10=1;b.character.rulesRuntime.temporaryHealth=8;b.character.rulesRuntime.effects=[{id:'old-effect',featureId:'path:iron-suppressor:suppressing-fire:3'}];const inventory=structuredClone(b.character.inventory),gold=b.character.goldCp,r=run(b,'rebuild.preview',{ledger:next.ledger,reason:'Solo change'});assert.deepEqual(r.consequences.endedEffectIds,['old-effect']);run(b,'rebuild.commit',{proposalId:r.proposalId,acceptConsequences:true});assert.equal(b.character.rulesRuntime.health.current,7);assert.equal(b.character.rulesRuntime.pools['gunslinger:second-wind'],0);assert.equal(b.character.rulesRuntime.hitDice.d10,1);assert.equal(b.character.rulesRuntime.temporaryHealth,0);assert.deepEqual(b.character.rulesRuntime.effects,[]);assert.deepEqual(b.character.inventory,inventory);assert.equal(b.character.goldCp,gold);
});
test('partial draft returns required choices but cannot become a committable proposal',()=>{
  const b=build('gunslinger',3,'iron-suppressor'),ledger=structuredClone(b.ledger);ledger.levels[2].choices={};const r=run(b,'rebuild.preview',{ledger,reason:'Choose new Path'});assert.equal(r.complete,false);assert.ok(r.summary.requiredChoices.some(c=>c.key==='pathId'));assert.equal(b.character.rulesRuntime.rebuildProposal,undefined);
});
test('rebuild rejects combat and active rests without changing state',()=>{
  const b=build('gunslinger',3,'iron-suppressor');b.character.rulesRuntime.inCombat=true;const before=structuredClone(b.character);assert.throws(()=>run(b,'rebuild.preview',{ledger:b.ledger,reason:'Change'}),/Finish combat/);assert.deepEqual(b.character,before);
});

test('rebuild previews and ends attunement when its spellcaster prerequisite is lost without removing the item',()=>{
  const b=build('shipwright',3,'powder-saint'),gear=require('../src/modules/archipelago/equipment'),item=gear.issue({definitionId:'wand-of-the-war-mage-1'});item.attuned=true;b.character.inventory.push(item);
  const r=run(b,'rebuild.preview',{ledger:build('gunslinger',3,'deadeye').ledger,reason:'Change Calling'});assert.deepEqual(r.consequences.endedAttunementIds,[item.instanceId]);assert.equal(b.character.inventory.at(-1).attuned,true);
  run(b,'rebuild.commit',{proposalId:r.proposalId,acceptConsequences:true});assert.equal(b.character.inventory.at(-1).instanceId,item.instanceId);assert.equal(b.character.inventory.at(-1).attuned,false);
});

test('same-Calling rebuild preserves lost-folio availability and cannot restore unprepared lost spells',()=>{
  const b=build('shipwright',6,'powder-saint'),before=require('../src/modules/archipelago/system/rules2024').replay(b.ledger),forgotten=before.spellcasting.shipwright.folio.find(id=>!b.character.rulesRuntime.preparations.shipwright.includes(id)&&!before.spellcasting.shipwright.alwaysPrepared.includes(id));assert.ok(forgotten);run(b,'folio.lose',{folioId:'lost-book',confirmed:true});const lost=structuredClone(b.character.rulesRuntime.folioUnavailable),r=run(b,'rebuild.preview',{ledger:b.ledger,reason:'Keep the same Calling'});run(b,'rebuild.commit',{proposalId:r.proposalId,acceptConsequences:true});assert.deepEqual(b.character.rulesRuntime.folioUnavailable,lost);assert.ok(!b.character.rulesRuntime.folioMemory.includes(forgotten));const projected=require('../src/modules/archipelago/system/rules2024').runtime.project(before,b.character.rulesRuntime);assert.equal(projected.spellcasting.shipwright.folio.length,0);
});
