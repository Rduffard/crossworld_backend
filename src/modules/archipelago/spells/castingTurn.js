const { CastingTurnBudgetError, transitionCastingTurnBudget } = require('@crossworld/sanguine-engine/casting-turn');

const budgetMessages = {
  CASTING_TURN_LIMIT: 'Only one spell slot per turn; Quickened prohibits another levelled spell',
  FREE_METAMAGIC_ALREADY_USED: 'Arcane Apotheosis already used this turn',
  INVALID_CASTING_TURN_INPUT: 'Invalid casting turn budget',
};

function fail(message){
  throw Object.assign(new Error(message),{statusCode:422});
}

function validLabel(id){
  return typeof id==='string'&&Boolean(id.trim())&&id.length<=100&&!['__proto__','constructor','prototype'].includes(id);
}

function current(state){
  return state.ownerTurn?.open?state.ownerTurn.id:state.inCombat?state.externalCastingTurn:null;
}

function resolve(state,label,required=false){
  if(label!==undefined&&!validLabel(label))fail('Invalid turn ID');
  const saved=current(state);
  if(saved){
    if(label!==undefined&&label!==saved)fail('Use the current recorded casting turn');
    return saved;
  }
  if(state.inCombat||required)fail('Record the active owner or GM encounter turn before casting');
  return undefined;
}

function record(state,turnId,request){
  if(!turnId)return;
  state.turnCasting??={};
  const turn=state.turnCasting[turnId]??{};
  let budget;
  try {
    budget=transitionCastingTurnBudget(turn,request);
  } catch(error) {
    if(error instanceof CastingTurnBudgetError&&Object.hasOwn(budgetMessages,error.code))fail(budgetMessages[error.code]);
    throw error;
  }
  if(!Object.hasOwn(state.turnCasting,turnId)&&Object.keys(state.turnCasting).length>=200)fail('Too many recorded turns; complete a rest before adding more');
  state.turnCasting[turnId]={...turn,...budget};
}

module.exports={current,validLabel,resolve,record};
