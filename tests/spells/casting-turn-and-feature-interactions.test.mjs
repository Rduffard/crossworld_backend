import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build,rules} from '../helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const commands=require('../../src/modules/archipelago/characters/commands');
const gear=require('../../src/modules/archipelago/equipment');

function run(c,type,payload,context){
  const {changes,result}=commands.apply(c,{operationId:'acceptance-command',expectedRevision:c.documentRevision,
    rulesVersion:'SA-CHAR-1',type,payload},context);
  return {character:{...c,...changes},result};
}

test('ordinary casts, scrolls and charged items share the recorded turn and reject forged turn labels',()=>{
  let {character:c}=build('tidecaller',3);
  c.rulesLedger.levels[1].choices.metamagic=['quickened-spell','subtle-spell'];
  const s=rules.replay(c.rulesLedger);
  const spellId=s.spellcasting.tidecaller.prepared.find(id=>rules.blueprint.spells.find(spell=>spell.id===id).castingTime==='Action');
  const cast={spellId,callingId:'tidecaller',slotLevel:1};
  const scroll=gear.issue({definitionId:'spell-scroll',spellId});
  const spareScroll=gear.issue({definitionId:'spell-scroll',spellId});
  const wand=gear.issue({definitionId:'wand-of-magic-missiles'});
  c.inventory.push(scroll,spareScroll,wand);
  c.loadout={...c.loadout,mainHand:wand.instanceId,offHand:null,grip:'one'};
  const scrollCast={instanceId:scroll.instanceId,callingId:'tidecaller',confirmed:true};
  const itemCast={instanceId:wand.instanceId,charges:1,confirmed:true};
  c.rulesRuntime.inCombat=true;
  assert.throws(()=>run(c,'spell.cast',cast),/Record the active/);
  assert.throws(()=>run(c,'scroll.cast',{...scrollCast,turnId:'forged'}),/Record the active/);
  assert.throws(()=>run(c,'item.cast',itemCast),/Record the active/);
  c=run(c,'turn.start',{turnId:'owner-one',confirmed:true}).character;
  assert.equal(c.rulesRuntime.turnCasting,undefined);
  const sources=[['spell.cast',cast],['scroll.cast',scrollCast],['item.cast',itemCast]];
  for(const [firstType,firstPayload] of sources){
    const accepted=run(c,firstType,firstPayload).character;
    assert.deepEqual(accepted.rulesRuntime.turnCasting['owner-one'],{
      slotSpent:firstType==='spell.cast',leveled:true,quickened:false,freeMetamagic:false,
    });
    for(const [secondType,payload] of sources){
      const secondPayload=firstType===secondType&&secondType==='scroll.cast'
        ?{...payload,instanceId:spareScroll.instanceId}:payload;
      if(firstType==='spell.cast'&&secondType==='spell.cast'){
        assert.throws(()=>run(accepted,secondType,secondPayload),/Only one spell slot/);
      }else{
        const second=run(accepted,secondType,secondPayload).character;
        assert.equal(second.rulesRuntime.castings.length,2);
        assert.equal(second.rulesRuntime.turnCasting['owner-one'].slotSpent,
          firstType==='spell.cast'||secondType==='spell.cast');
      }
    }
  }
  const first=run(c,'spell.cast',cast).character;
  const before=structuredClone(first);
  assert.throws(()=>run(first,'spell.cast',cast),/Only one spell slot/);
  assert.throws(()=>run(first,'spell.cast',{...cast,turnId:'other'}),/current recorded casting turn/);
  assert.deepEqual(first,before);
  assert.throws(()=>run(first,'spell.cast',{...cast,slotLevel:9}),/available spell slot/);
  assert.throws(()=>run(first,'spell.cast',{...cast,spellId:'missing-spell'}),/Unknown spell/);
  assert.throws(()=>run(first,'spell.cast',{...cast,targets:['duplicate','duplicate']}),/distinct spell targets/);
  const quickened={callingId:'tidecaller',spellId:s.spellcasting.tidecaller.cantrips[0],metamagic:['quickened-spell']};
  assert.throws(()=>run(run(c,'scroll.cast',scrollCast).character,'spell.cast',quickened),/Quickened prohibits/);
  assert.throws(()=>run(run(c,'spell.cast',quickened).character,'scroll.cast',scrollCast),/Quickened prohibits/);
  assert.throws(()=>run(run(c,'item.cast',itemCast).character,'spell.cast',quickened),/Quickened prohibits/);
  assert.throws(()=>run(run(c,'spell.cast',quickened).character,'item.cast',itemCast),/Quickened prohibits/);
  const quickFirst=run(c,'spell.cast',quickened).character;
  assert.throws(()=>run(quickFirst,'item.cast',{...itemCast,charges:3,instanceId:'missing'}),/held eligible/);
  const depleted=structuredClone(quickFirst);
  depleted.inventory.find(item=>item.instanceId===wand.instanceId).chargesCurrent=1;
  assert.throws(()=>run(depleted,'item.cast',{...itemCast,charges:3}),/Insufficient item charges/);
  assert.throws(()=>run(quickFirst,'scroll.cast',{...scrollCast,confirmed:false}),/Confirm completion/);
  const tidecaller4=build('tidecaller',4).character;
  tidecaller4.rulesLedger.levels[1].choices.metamagic=['quickened-spell','subtle-spell'];
  const quickTurn=run(tidecaller4,'turn.start',{turnId:'quick-cantrips',confirmed:true}).character;
  const quick1=run(quickTurn,'spell.cast',quickened);
  const quick2=run(quick1.character,'spell.cast',quickened);
  assert.equal(quick2.result.management.castingTime,'Bonus Action');
  assert.deepEqual(quick2.character.rulesRuntime.turnCasting['quick-cantrips'],
    {slotSpent:false,leveled:false,quickened:true,freeMetamagic:false});
  c=run(first,'turn.end',{turnId:'owner-one',confirmed:true}).character;
  assert.deepEqual(c.rulesRuntime.turnCasting,first.rulesRuntime.turnCasting);
  c=run(c,'turn.external',{turnId:'enemy-one',confirmed:true}).character;
  assert.deepEqual(c.rulesRuntime.turnCasting,first.rulesRuntime.turnCasting);
  assert.equal(run(c,'spell.cast',cast).character.rulesRuntime.castings.at(-1).turnId,'enemy-one');
  const reaction=structuredClone(c);
  reaction.rulesRuntime.preparations.tidecaller[0]='shield';
  const shield={callingId:'tidecaller',spellId:'shield',slotLevel:1,trigger:{confirmed:true,eventId:'hit-one'}};
  const reacted=run(reaction,'spell.cast',shield);
  assert.match(reacted.result.management.castingTime,/Reaction/);
  assert.equal(reacted.character.rulesRuntime.turnCasting['enemy-one'].slotSpent,true);
  assert.throws(()=>run(reacted.character,'spell.cast',{...shield,trigger:{confirmed:true,eventId:'hit-two'}}),/Only one spell slot/);
  assert.throws(()=>run(c,'spell.cast',quickened),/Bonus Action on your own turn/);
  assert.throws(()=>run({...c,campaignId:'campaign'},'turn.external',{turnId:'forged',confirmed:true}),{statusCode:403});
  assert.throws(()=>run({...c,campaignId:'campaign'},'scene.record',{light:'bright',inCombat:false,confirmed:true}),{statusCode:403});
});

test('casting journal checks keep rejection precedence and leave rejected entries untouched',()=>{
  const {record}=require('../../src/modules/archipelago/spells/castingTurn');
  const state={turnCasting:Object.fromEntries(Array.from({length:200},(_,i)=>['turn-'+i,{}]))};
  state.turnCasting['turn-0']={slotSpent:true,leveled:true,quickened:false,freeMetamagic:true,relayCantrip:true};
  const before=structuredClone(state);
  assert.throws(()=>record(state,'turn-0',{level:1,spentSlot:true,freeMetamagic:true}),/Only one spell slot/);
  assert.throws(()=>record(state,'turn-0',{level:0,freeMetamagic:true}),/Arcane Apotheosis already used/);
  assert.throws(()=>record(state,'new-turn',{level:0}),/Too many recorded turns/);
  assert.deepEqual(state,before);
  record(state,'turn-0',{level:0});
  assert.deepEqual(state,before);
});

test('Action Surge records a non-Magic action without resetting the item casting budget',()=>{
  const {character}=build('gunslinger',3);
  const wand=gear.issue({definitionId:'wand-of-magic-missiles'});
  character.inventory.push(wand);
  character.loadout={...character.loadout,mainHand:wand.instanceId,offHand:null,grip:'one'};
  const c=run(character,'turn.start',{turnId:'surge-turn',confirmed:true}).character;
  const itemCast={instanceId:wand.instanceId,charges:1,confirmed:true};
  const first=run(c,'item.cast',itemCast).character;
  const optionId=rules.replay(first.rulesLedger).abilityOptions.find(option=>option.handler==='action-surge').id;
  assert.throws(()=>run(first,'ability.activate',{optionId,parameters:{confirmed:true,extraAction:'magic'}}),/non-Magic action/);
  const surged=run(first,'ability.activate',{optionId,parameters:{confirmed:true,extraAction:'attack'}});
  assert.equal(surged.result.recordOnly,true);
  assert.deepEqual(surged.character.rulesRuntime.turnCasting,first.rulesRuntime.turnCasting);
  const second=run(surged.character,'item.cast',itemCast).character;
  assert.deepEqual(second.rulesRuntime.turnCasting,first.rulesRuntime.turnCasting);
  assert.equal(second.inventory.find(item=>item.instanceId===wand.instanceId).chargesCurrent,wand.chargesCurrent-2);
});

function contingencyFixture(){
  const b=build('shipwright',20,'powder-saint');
  const statue=gear.issue({definitionId:'component-self-statuette-150000'});
  b.character.inventory.push(statue);
  const spells=['contingency','water-breathing','fireball'];
  const known=b.summary.spellcasting.shipwright;
  b.character.rulesRuntime.folio.push(...spells.filter(id=>!known.folio.includes(id)&&!known.alwaysPrepared.includes(id)));
  const prepared=b.character.rulesRuntime.preparations.shipwright;
  const required=spells.filter(id=>!known.alwaysPrepared.includes(id));
  prepared.splice(0,prepared.length,...[...new Set([...required,...prepared])].slice(0,known.preparedCount));
  return {...b,statue,payload:{spellId:'contingency',callingId:'shipwright',slotLevel:6,materialIds:[statue.instanceId],
    contingency:{spellId:'water-breathing',callingId:'shipwright',slotLevel:3,trigger:'I am engulfed in water',confirmed:true}}};
}

test('Contingency spends both slots atomically, survives reload and fires once on the caster',()=>{
  const {character:c,payload}=contingencyFixture();
  const before=structuredClone(c);
  assert.throws(()=>run(c,'spell.cast',{...payload,contingency:{...payload.contingency,spellId:'fireball'}}),/can target you/);
  assert.throws(()=>run(c,'spell.cast',{...payload,contingency:{...payload.contingency,slotLevel:6}}),/level five or lower/);
  assert.throws(()=>run({...c,rulesRuntime:{...c.rulesRuntime,inCombat:true}},'spell.cast',payload),/ten-minute casting/);
  c.rulesRuntime.slots[2]=0;
  assert.throws(()=>run(c,'spell.cast',payload),/available spell slot/);
  c.rulesRuntime.slots[2]=before.rulesRuntime.slots[2];
  assert.deepEqual(c,before);
  const first=run(c,'spell.cast',payload);
  assert.equal(first.character.rulesRuntime.slots[5],c.rulesRuntime.slots[5]-1);
  assert.equal(first.character.rulesRuntime.slots[2],c.rulesRuntime.slots[2]-1);
  assert.equal(first.character.rulesRuntime.effects.some(e=>e.featureId==='spell:water-breathing'),false);
  const replacement=run(first.character,'spell.cast',{...payload,contingency:{...payload.contingency,trigger:'I touch the water'}});
  const reload=JSON.parse(JSON.stringify(replacement.character));
  assert.equal(reload.rulesRuntime.effects.filter(e=>e.contingency).length,1);
  const trigger={effectId:replacement.result.castId,confirmed:true};
  assert.throws(()=>run(reload,'contingency.trigger',{...trigger,effectId:first.result.castId}),/active Contingency/);
  const done=run(reload,'contingency.trigger',trigger);
  assert.deepEqual(done.character.rulesRuntime.slots,reload.rulesRuntime.slots);
  assert.deepEqual(done.result.targetIds,['self']);
  assert.equal(done.character.rulesRuntime.effects.at(-1).featureId,'spell:water-breathing');
  assert.throws(()=>run(done.character,'contingency.trigger',trigger),/active Contingency/);
});

test('Contingency cancellation and loss of the statuette end the pending spell without refund',()=>{
  const {character:c,payload,statue}=contingencyFixture();
  const {character:pending,result}=run(c,'spell.cast',payload);
  const effect=pending.rulesRuntime.effects.find(e=>e.id===result.castId);
  assert.equal(effect.expiresAt-effect.createdAt,10*24*3600000);
  const expired={...pending,rulesRuntime:{...pending.rulesRuntime,worldTime:effect.expiresAt}};
  assert.throws(()=>run(expired,'contingency.trigger',{effectId:result.castId,confirmed:true}),/active Contingency/);
  const cancelled=run(pending,'effect.end',{effectId:result.castId}).character;
  assert.deepEqual(cancelled.rulesRuntime.slots,pending.rulesRuntime.slots);
  assert.throws(()=>run(cancelled,'contingency.trigger',{effectId:result.castId,confirmed:true}),/active Contingency/);
  const sold=run(pending,'equipment.sell',{instanceId:statue.instanceId,quantity:1,proceedsCp:0,reason:'Test disposal'},{gmAllowed:true}).character;
  assert.equal(sold.rulesRuntime.effects.some(e=>e.contingency),false);
});

test('Nimbus recovery spends a fifth-level slot with no action while the other capstones take a Bonus Action',()=>{
  for(const [path,pool] of [['leviathan-anchor','nimbus'],['oath-of-the-free-port','open-harbor'],['iron-covenant','standard'],['lantern-vigil','dawn']]){
    const {character:c}=build('warden',20,path),poolId=path+':'+pool;
    c.rulesRuntime.pools[poolId]=0;
    c.rulesRuntime.effects.push({id:'fixture-effect',featureId:'fixture:ends-after-action',endsAfterAction:true});
    const payload={type:'restore-feature',poolId,slotLevel:5};
    assert.throws(()=>run(c,'resource.convert',{...payload,slotLevel:4}),/Level five slot required/);
    const {character:after}=run(c,'resource.convert',payload);
    assert.equal(after.rulesRuntime.slots[4],c.rulesRuntime.slots[4]-1);
    assert.equal(after.rulesRuntime.pools[poolId],1);
    assert.equal(after.rulesRuntime.effects.some(e=>e.endsAfterAction),path==='leviathan-anchor');
    assert.throws(()=>run(after,'resource.convert',payload),/must be exhausted/);
  }
});

test('specialized action availability reflects saved prerequisites',()=>{
  const tidecaller=build('tidecaller',6,'tempest-heart');
  const project=b=>rules.runtime.project(b.summary,b.character.rulesRuntime,b.character).abilityOptions;
  const pulse=()=>project(tidecaller).find(o=>o.handler==='tempest-pulse');
  assert.equal(pulse().unavailableReason,'Requires your open owner turn');
  tidecaller.character=run(tidecaller.character,'turn.start',{turnId:'owner-turn',confirmed:true}).character;
  assert.match(pulse().unavailableReason,/level-one-or-higher spell/);
  const spellId=tidecaller.character.rulesRuntime.preparations.tidecaller[0];
  tidecaller.character=run(tidecaller.character,'spell.cast',{spellId,callingId:'tidecaller',slotLevel:1}).character;
  assert.equal(pulse().available,true);
  const doctor=build('doctor',3,'field-surgeon');
  doctor.character.inventory=doctor.character.inventory.filter(i=>i.definitionId!=='healer-kit');
  assert.match(project(doctor).find(o=>o.handler==='triage').unavailableReason,/healer's kit/);
  doctor.character.inventory.push(gear.issue({definitionId:'healer-kit'}));
  assert.equal(project(doctor).find(o=>o.handler==='triage').available,true);
});
