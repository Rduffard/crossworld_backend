import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export const rules=require('../../src/modules/archipelago/system/rules2024');
export const scores={might:8,agility:15,resolve:15,wit:10,instinct:10,spirit:13};
export function creation(originId='yuma-core',backgroundId='deckhand'){
  const background=rules.blueprint.creation.backgrounds.find(b=>b.id===backgroundId);
  return {originId,backgroundId,method:'point-buy',increases:{[background.attributes[0]]:2},equipment:backgroundId==='custom'?'gold':'pack',size:'medium',
    ...(backgroundId==='custom'?{custom:{attributes:['might','agility','resolve'],skills:['athletics','survival'],tool:'thieves-tools',feat:'alert'}}:{})};
}
export function complete(ledger,pathId){
  const next=structuredClone(ledger),event=next.levels.at(-1);
  for(let attempt=0;attempt<60;attempt++){
    const summary=rules.replay(next);if(summary.decisionsComplete)return {ledger:next,summary};
    const request=summary.requiredChoices[0];
    if(request.key==='feat'){
      event.choices.feat='ability-score-improvement';
      const id=Object.keys(scores).find(id=>summary.attributes[id]<=18);event.choices.increases={[id]:2};
    }else if(request.key==='backgroundSkills'){
      const b=rules.blueprint.creation.backgrounds.find(b=>b.id===next.creation.backgroundId);
      const base=b.id==='custom'?next.creation.custom.skills:b.skills;
      const required=base.filter(id=>!summary.training.includes(id));
      event.choices.backgroundSkills=[...required,...request.options.filter(id=>!required.includes(id))].slice(0,2);
    }else if(request.key==='pathId')event.choices.pathId=[pathId??request.options[0]];
    else if(request.key==='spellMastery')event.choices.spellMastery=[1,2].map(level=>request.options.find(id=>rules.blueprint.spells.find(s=>s.id===id).level===level));
    else if(request.key==='prepared'&&next.levels.length>1){
      const before=rules.replay({...next,levels:next.levels.slice(0,-1)}).spellcasting[event.callingId].prepared;
      event.choices.prepared=[...before.filter(id=>request.options.includes(id)),...request.options.filter(id=>!before.includes(id))].slice(0,request.count);
    }else event.choices[request.key]=request.options.slice(0,request.count);
  }
  throw Error('Unresolved test choices for '+event.callingId);
}
export function build(callingId,level=1,pathId,originId='yuma-core',backgroundId='deckhand'){
  let result;for(let n=1;n<=level;n++)result=complete({version:3,ruleset:'srd-5.2.1',revision:n-1,baseAttributes:scores,creation:creation(originId,backgroundId),levels:[...(result?.ledger.levels??[]),{callingId,choices:{}}]},pathId);
  const character=require('../../src/modules/archipelago/characters/rules2024').build({name:'Phase Two Test',attributes:scores,creation:result.ledger.creation,firstLevel:result.ledger.levels[0]});
  return {...result,character:{...character,rulesLedger:result.ledger,rulesRuntime:rules.runtime.initialize(result.summary),attributes:result.summary.attributes}};
}
