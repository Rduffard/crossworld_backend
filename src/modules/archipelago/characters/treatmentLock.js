const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  scope:{type:String,required:true},target:{type:String,required:true,maxlength:100},
  restEpoch:{type:String,required:true,maxlength:100},
  sourceCharacterId:{type:mongoose.Schema.Types.ObjectId,required:true},operationId:{type:String,required:true},
},{timestamps:true,strict:'throw'});
schema.index({scope:1,target:1,restEpoch:1},{unique:true});
module.exports=mongoose.models.ArchipelagoTreatmentLock||mongoose.model('ArchipelagoTreatmentLock',schema);
