import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build,rules} from '../helpers/phase2.mjs';
const require=createRequire(import.meta.url);
const commands=require('../../src/modules/archipelago/characters/commands');
const order=['reaver','corsair','navigator','warden','tidecaller','doctor','shipwright','gunslinger'];
for(const calling of order){
  const rows=[];
  for(const path of rules.blueprint.paths.filter(path=>path.callingId===calling)){
    for(let level=1;level<=20;level++){
      const {character,summary}=build(calling,level,path.id);
      character.rulesRuntime.worldTime=0;
      rows.push([path.id,level,summary,rules.runtime.project(summary,character.rulesRuntime,character)]);
      const option=summary.abilityOptions.find(option=>option.costs.length);
      if(!option)continue;
      try{
        const result=commands.apply(character,{operationId:'roster-probe',expectedRevision:0,rulesVersion:'SA-CHAR-1',type:'ability.activate',payload:{optionId:option.id,parameters:{confirmed:false}}});
        rows.push([result.result.type,result.result.optionId,result.changes.rulesRuntime.pools]);
      }catch(error){rows.push([error.statusCode,error.code,error.message]);}
    }
  }
  console.log(calling,rows.length,createHash('sha256').update(JSON.stringify(rows)).digest('hex'));
}
console.log('catalog',rules.blueprint.contentHash);

