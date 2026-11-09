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

function record(state,turnId,{spentSlot=false,level,quickened=false,freeMetamagic=false}){
  if(!turnId)return;
  state.turnCasting??={};
  const turn=state.turnCasting[turnId]??{};
  if(spentSlot&&turn.slotSpent||level>0&&turn.quickened||quickened&&turn.leveled)fail('Only one spell slot per turn; Quickened prohibits another levelled spell');
  if(freeMetamagic&&turn.freeMetamagic)fail('Arcane Apotheosis already used this turn');
  if(!Object.hasOwn(state.turnCasting,turnId)&&Object.keys(state.turnCasting).length>=200)fail('Too many recorded turns; complete a rest before adding more');
  state.turnCasting[turnId]={...turn,slotSpent:turn.slotSpent||spentSlot,leveled:turn.leveled||level>0,quickened:turn.quickened||quickened,freeMetamagic:turn.freeMetamagic||freeMetamagic};
}

module.exports={current,validLabel,resolve,record};
