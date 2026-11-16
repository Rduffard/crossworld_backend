import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {build,rules} from '../helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const commands=require('../../src/modules/archipelago/characters/commands');
const rows=[];
const catalog=rules.blueprint;
const inventory=catalog.callings.map(c=>({
  id:c.id,starting:c.starting,
  paths:catalog.paths.filter(p=>p.callingId===c.id).map(p=>{
    const {summary}=build(c.id,20,p.id);
    return {id:p.id,levels:p.featureLevels,features:summary.features.map(f=>f.id),
      resources:summary.resources,options:summary.abilityOptions.map(o=>({id:o.id,handler:o.handler,action:o.action,costs:o.costs}))};
  }),
}));
for(const path of catalog.paths.filter(p=>p.callingId==='gunslinger')){
  for(let level=1;level<=20;level++){
    const {summary,character}=build('gunslinger',level,path.id);
    rows.push(summary);
    for(const mode of ['success','empty','wrong-target','stale']){
      const c=structuredClone(character);
      c.rulesRuntime.worldTime=0;
      c.rulesRuntime.health.current=1;
      if(mode==='empty')c.rulesRuntime.pools['gunslinger:second-wind']=0;
      const body={operationId:'gunslinger-probe',expectedRevision:mode==='stale'?1:0,rulesVersion:'SA-CHAR-1',type:'ability.activate',
        payload:{optionId:'calling:gunslinger:second-wind:1#main',targetIds:mode==='wrong-target'?['other']:[]}};
      try{
        const {changes,result}=commands.apply(c,body);
        const {rolls,healing,...facts}=result;
        const {health,...state}=changes.rulesRuntime;
        if (!facts.effect?.id || facts.effect.id !== state.effects.at(-1)?.id) throw Error("Effect identity mismatch");
        facts.effect = {...facts.effect,id:"effect-one"};
        state.effects = state.effects.map(effect=>({...effect,id:"effect-one"}));
        rows.push({facts,state,rolled:rolls.length===1&&rolls[0]>=1&&rolls[0]<=10,healingCorrect:healing===rolls[0]+level,healthCorrect:health.current===Math.min(health.max,1+healing)});
      }catch(e){rows.push([e.constructor.name,e.statusCode,e.message]);}
    }
  }
}
const value={catalogHash:createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),rows};
const json=JSON.stringify(value);
if(process.argv[2])writeFileSync(process.argv[2],json);
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(inventory,null,2)+'\n');
console.log(rows.length,createHash('sha256').update(json).digest('hex'),rows[1]?.facts?'valid activation captured':JSON.stringify(rows[1]));
