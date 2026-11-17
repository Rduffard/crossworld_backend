const { clauses, featUseRecoversOnInitiativeOrRest } = require('@crossworld/sanguine-engine/feats');

function action(state){state.effects=state.effects.filter(e=>!e.endsAfterAction);}
function source(c,id){
  const index=c.rulesLedger.levels.findIndex(e=>e.choices?.feat===id);
  const fromLineage=c.rulesLedger.creation.lineage?.choices?.originFeat?.id===id;
  const grant=index>=0?'level:'+(index+1):fromLineage?'lineage:human:origin-feat':'background:'+c.rulesLedger.creation.backgroundId;
  return 'feat:'+id+'@'+grant+':'+clauses[id];
}
function recover(state,rest=false){
  for(const record of Object.values(state.featState??{})){
    if(featUseRecoversOnInitiativeOrRest(record.featId))record.spent=false;
    if(rest){record.events=[];record.turns=[];}
  }
}

module.exports = { action, source, recover };
