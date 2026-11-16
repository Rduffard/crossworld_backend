import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {build} from '../helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const rules=require('../../src/modules/archipelago/system/characterSystem');
const clock=require('../../src/modules/archipelago/combat/effects/clock');
const entries=require('../fixtures/phase3-generic-activation-inventory.json');
const inventory=new Map(),rows=[];
function capture(featureId,label,fn){
 try {const value=fn();rows.push({featureId,label,value:JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)?'<instance>':v))});}
 catch (e){rows.push({featureId,label,error:[e.constructor.name,e.statusCode,e.message]});}
}
for(const path of rules.blueprint.paths){
 const {summary,character}=build(path.callingId,20,path.id);
 for(const f of entries.filter(entry=>entry.path===path.id)){
  const options=summary.abilityOptions.filter(o=>o.featureId===f.id).map(({id,handler,action,costs,description})=>({id,handler,action,costs,description}));
  if(JSON.stringify(options)!==JSON.stringify(f.options))throw Error('Typed option drift: '+f.id);
  if(!summary.features.some(feature=>feature.id===f.id))throw Error('Missing feature: '+f.id);
  inventory.set(f.id,f);
  const state=character.rulesRuntime;
  const op={expectedRevision:state.revision,type:'use-feature',featureId:f.id};
  const cases={
   valid:()=>rules.runtime.update(summary,state,op),
   repeat:()=>{const next=rules.runtime.update(summary,state,op);return rules.runtime.update(summary,next,{...op,expectedRevision:next.revision});},
   exhausted:()=>{const copy=structuredClone(state);copy.pools[f.costs[0].poolId]=0;return rules.runtime.update(summary,copy,op);},
   incapacitated:()=>{const copy=structuredClone(state);copy.conditions=[{conditionId:'stunned',source:'probe'}];return rules.runtime.update(summary,copy,op);},
   expired:()=>{const next=rules.runtime.update(summary,state,op);clock.advance(next,100000000);return next;},
   cleanup:()=>{const next=rules.runtime.update(summary,state,op);return rules.runtime.update(summary,next,{expectedRevision:next.revision,type:'end-feature-effects',featureId:f.id});},
   'unknown-feature':()=>rules.runtime.update(summary,state,{...op,featureId:'missing'}),
   malformed:()=>rules.runtime.update(summary,state,{...op,note:123}),
   stale:()=>rules.runtime.update(summary,state,{...op,expectedRevision:state.revision+1}),
  };
  for(const [label,fn] of Object.entries(cases))capture(f.id,label,fn);
 }
}
const json=JSON.stringify(rows);
if(process.argv[2])writeFileSync(process.argv[2],json);

console.log(inventory.size, rows.length,createHash('sha256').update(json).digest('hex'));
console.log([...inventory.values()].filter(f=>!f.command).map(f=>f.id));
