import {randomBytes} from 'node:crypto';

export function campaignMatches(record, filter){
  return Object.entries(filter).every(([key,value])=>{
    if(key==='$or')return value.some(clause=>campaignMatches(record,clause));
    if(key==='$expr')return (record.players??[]).length<record.maxPlayers;
    if(value?.$in)return value.$in.some(id=>String(record[key])===String(id));
    return Array.isArray(record[key])?record[key].some(id=>String(id)===String(value)):String(record[key])===String(value);
  });
}

function query(read){
  return {
    session(){return this;},sort(){return this;},limit(count){this.count=count;return this;},select(fields){this.fields=fields.split(' ');return this;},
    async lean(){
      const rows=read();
      const value=structuredClone(Array.isArray(rows)&&this.count?rows.slice(0,this.count):rows);
      return this.fields&&Array.isArray(value)?value.map(record=>Object.fromEntries(this.fields.map(key=>[key,record[key]]))):value;
    },
  };
}

function applyUpdate(record,update){
  for(const [key,value] of Object.entries(update.$addToSet??{})){
    record[key]??=[];
    if(!record[key].includes(value))record[key].push(value);
  }
  for(const [key,value] of Object.entries(update.$set??{})){
    const parts=key.split('.');
    const field=parts.pop(), parent=parts.reduce((obj,part)=>obj[part],record);
    parent[field]=structuredClone(value);
  }
  for(const key of Object.keys(update.$unset??{})){
    const parts=key.split('.');
    const field=parts.pop(), parent=parts.reduce((obj,part)=>obj[part],record);
    delete parent[field];
  }
  for(const [key,value] of Object.entries(update.$inc??{})){
    const parts=key.split('.');
    const field=parts.pop(), parent=parts.reduce((obj,part)=>obj[part],record);
    parent[field]=(parent[field]??0)+value;
  }
}

export function campaignStore(getCharacters){
  const store={campaigns:[],sessions:[],rejectRosterWrite:false};
  const find=(records,filter)=>records.find(record=>campaignMatches(record,filter));
  const update=(records,filter,changes)=>{
    const record=find(records,filter);
    if(record)applyUpdate(record,changes);
    return record;
  };
  store.Campaign={
    init:async()=>{},
    create:async data=>{
      const campaign={_id:randomBytes(12).toString('hex'),players:[],characterIds:[],maxPlayers:6,status:'active',...data};
      store.campaigns.push(campaign);return structuredClone(campaign);
    },
    find:filter=>query(()=>store.campaigns.filter(campaign=>campaignMatches(campaign,filter))),
    findOne:filter=>query(()=>find(store.campaigns,filter)??null),
    findOneAndUpdate:(filter,changes)=>query(()=>update(store.campaigns,filter,changes)??null),
    updateOne:async(filter,changes)=>({matchedCount:!store.rejectRosterWrite&&update(store.campaigns,filter,changes)?1:0}),
  };
  store.Character={
    find:filter=>query(()=>getCharacters().filter(character=>campaignMatches(character,filter))),
    updateOne:async(filter,changes)=>({matchedCount:update(getCharacters(),filter,changes)?1:0}),
  };
  store.Session={
    init:async()=>{},
    async create(data){
      const row={...data,_id:randomBytes(12).toString('hex'),status:'open',connectedUsers:[]};
      store.sessions.push(row);
      return structuredClone(row);
    },
    find:filter=>query(()=>store.sessions.filter(session=>campaignMatches(session,filter)).toReversed()),
    findOneAndUpdate:(filter,changes)=>query(()=>update(store.sessions,filter,changes)??null),
  };
  return store;
}
