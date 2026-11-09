const {randomBytes}=require('node:crypto');

function fail(message,statusCode=422){
  throw Object.assign(new Error(message),{statusCode});
}

function present(session,userId){
  const host=String(session.createdBy)===String(userId);
  return {_id:session._id,name:session.name,status:session.status,host,
    joined:host||(session.connectedUsers??[]).some(id=>String(id)===String(userId)),
    ...(host?{roomCode:session.roomCode}:{})};
}

function handlers(Campaign,Session){
  async function membership(req){
    const campaign=await Campaign.findOne({_id:req.params.campaignId,$or:[{owner:req.user._id},{players:req.user._id}]}).lean();
    if(!campaign)fail('Campaign not found',404);
    return campaign;
  }
  return {
    async list(req,res){
      const campaign=await membership(req);
      const sessions=await Session.find({campaignId:campaign._id}).sort({createdAt:-1,_id:-1}).limit(100).lean();
      res.send(sessions.map(session=>present(session,req.user._id)));
    },
    async create(req,res){
      const campaign=await membership(req);
      if(String(campaign.owner)!==String(req.user._id))fail('Only the campaign GM can host a session',403);
      if(campaign.status!=='active')fail('Only active campaigns can host sessions',409);
      const {name}=req.body??{};
      if(Object.keys(req.body??{}).some(key=>key!=='name')||typeof name!=='string'||!name.trim()||name.trim().length>100)fail('Enter a session name of 1 to 100 characters');
      await Session.init();
      for(let attempt=0;attempt<3;attempt++){
        try{
          const session=await Session.create({campaignId:campaign._id,createdBy:req.user._id,name:name.trim(),roomCode:randomBytes(6).toString('hex').toUpperCase()});
          return res.status(201).send(present(session,req.user._id));
        }catch(error){
          if(error.code!==11000||!error.keyPattern?.roomCode)throw error;
        }
      }
      fail('Could not allocate a room code. Retry session creation.',409);
    },
    async join(req,res){
      const campaign=await membership(req);
      if(campaign.status!=='active')fail('Only active campaigns accept session participants',409);
      const {roomCode}=req.body??{};
      if(Object.keys(req.body??{}).some(key=>key!=='roomCode')||typeof roomCode!=='string'||!/^\w{4,12}$/.test(roomCode.trim()))fail('Enter the session room code');
      const session=await Session.findOneAndUpdate({campaignId:campaign._id,roomCode:roomCode.trim().toUpperCase(),status:{$in:['open','in_progress']}},
        {$addToSet:{connectedUsers:req.user._id}},{new:true,runValidators:true}).lean();
      if(!session)fail('Open session not found for this room code',404);
      res.send(present(session,req.user._id));
    },
  };
}

module.exports={handlers};
