const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  characterId:{type:mongoose.Schema.Types.ObjectId,required:true},
  owner:{type:mongoose.Schema.Types.ObjectId,required:true},
  actor:{type:mongoose.Schema.Types.ObjectId},actorRole:{type:String},
  operationId:{type:String,required:true,maxlength:80},
  digest:{type:String,required:true},
  response:{type:mongoose.Schema.Types.Mixed,required:true},
},{timestamps:true,strict:'throw',minimize:false});
schema.index({characterId:1,operationId:1},{unique:true});
schema.index({characterId:1,owner:1,_id:-1});
module.exports=mongoose.models.ArchipelagoCharacterCommand||mongoose.model('ArchipelagoCharacterCommand',schema);
