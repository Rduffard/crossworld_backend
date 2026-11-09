const {createHash}=require('node:crypto');
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function request(req){
  const operationId=req.get?.('Idempotency-Key');
  if(operationId===undefined)return null;
  if(typeof operationId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(operationId))throw Object.assign(new Error('Invalid creation Idempotency-Key'),{statusCode:422,code:'invalid_operation_id',fieldPath:'Idempotency-Key'});
  return {operationId,digest:createHash('sha256').update(JSON.stringify(canonical(req.body))).digest('hex')};
}
function replay(character,key){
  if(character.creationRequest.digest!==key.digest)throw Object.assign(new Error('Creation operation ID was already used with different character choices'),{statusCode:409,code:'operation_conflict',fieldPath:'Idempotency-Key'});
  return character.creationRequest.initialState;
}
module.exports={request,replay};
