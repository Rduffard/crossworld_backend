const { clauses, featUseRecoversOnInitiativeOrRest } = require('@crossworld/sanguine-engine/feats');

function action(state){state.effects=state.effects.filter(e=>!e.endsAfterAction);}
function source(c,id){const index=c.rulesLedger.levels.findIndex(e=>e.choices.feat===id);return 'feat:'+id+'@'+(index<0?'background:'+c.rulesLedger.creation.backgroundId:'level:'+(index+1))+':'+clauses[id];}
function recover(state,rest=false){
  for(const record of Object.values(state.featState??{})){
    if(featUseRecoversOnInitiativeOrRest(record.featId))record.spent=false;
    if(rest){record.events=[];record.turns=[];}
  }
}

module.exports = { action, source, recover };
