function handler(Character,Receipt,Campaign){return async(req,res,next)=>{
  try{
    let c=await Character.findOne({_id:req.params.characterId,owner:req.user._id}).lean();
    if(!c&&Campaign){c=await Character.findOne({_id:req.params.characterId}).lean();if(c&&!(await require('./authority').context(c,req.user._id,Campaign)).gmAllowed)c=null;}
    if(!c)throw Object.assign(new Error('Character not found'),{statusCode:404});
    const {cursor,limit='20',...extra}=req.query;
    if(Object.keys(extra).length||typeof limit!=='string'||!/^\d+$/.test(limit)||Number(limit)<1||Number(limit)>100||cursor!==undefined&&(typeof cursor!=='string'||!/^[a-f0-9]{24}$/i.test(cursor)))throw Object.assign(new Error('Choose a limit from 1 to 100 and a valid audit cursor'),{statusCode:422,code:'invalid_pagination',fieldPath:'query'});
    const count=Number(limit),query={characterId:req.params.characterId,owner:c.owner??req.user._id,...(cursor?{_id:{$lt:cursor}}:{})};
    const records=await Receipt.find(query).select('_id operationId createdAt response.operationResult').sort({_id:-1}).limit(count+1).lean();
    const page=records.slice(0,count);
    res.send({items:page.map(r=>({id:String(r._id),operationId:r.operationId,createdAt:r.createdAt,result:r.response?.operationResult??null})),nextCursor:records.length>count?String(page.at(-1)._id):null});
  }catch(error){next(error);}
};}
module.exports={handler};
