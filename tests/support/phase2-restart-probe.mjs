// Fresh-process HTTP read probe. Never use the configured application database.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),uri=process.env.SA_PHASE2_TEST_MONGO_URI;
if(!uri?.startsWith('mongodb://127.0.0.1:37027/sa_phase2_'))throw Error('Only the isolated acceptance database is permitted');
const mongoose=require('mongoose'),express=require('express'),jwt=require('jsonwebtoken');
const {JWT_SECRET}=require('../../src/config/env');
let server;
try{
  await mongoose.connect(uri,{serverSelectionTimeoutMS:10000});
  const app=express();app.use(express.json());app.use('/archipelago',require('../../src/modules/archipelago/routes'));
  app.use((e,_req,res,_next)=>res.status(e.statusCode??500).send({message:e.message}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const Character=require('../../src/modules/archipelago/characters/model'),rows=[];
  for(const c of await Character.find().sort({_id:1}).lean()){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/archipelago/characters/${c._id}`,{headers:{Authorization:'Bearer '+jwt.sign({_id:String(c.owner)},JWT_SECRET)}});
    if(response.status!==200)throw Error('Restarted server could not load the saved character: '+response.status);
    const body=await response.json();
    rows.push(Object.fromEntries(['_id','documentRevision','rulesLedger','rulesRuntime','inventory','loadout','goldCp','campaignId'].map(k=>[k,body[k]])));
  }
  process.stdout.write(JSON.stringify(rows));
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await mongoose.disconnect();
}
