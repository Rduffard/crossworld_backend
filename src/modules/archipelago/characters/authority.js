function fail(message,statusCode=403){throw Object.assign(new Error(message),{statusCode});}
const gmCommands=['milestone.authorize','inspiration.grant','scene.record','equipment.award','equipment.sell','equipment.dawn','spells.discover','rebuild.approve','turn.start','turn.end','turn.external','contingency.trigger'];
async function context(character,userId,Campaign,session){
  const isOwner=String(character.owner)===String(userId);
  if(!character.campaignId)return {isOwner,gmAllowed:isOwner,campaignRegistered:false,userId:String(userId),role:'solo-owner'};
  if(!Campaign)return {isOwner,gmAllowed:false,campaignRegistered:false,userId:String(userId),role:'owner'};
  let query=Campaign.findOne({_id:character.campaignId});if(session)query=query.session(session);
  const campaign=await query.lean(),gm=campaign&&String(campaign.owner)===String(userId);
  const registered=Boolean(campaign?.characterIds?.some(id=>String(id)===String(character._id))&&(gm||campaign.players?.some(id=>String(id)===String(userId))));
  return {isOwner,gmAllowed:Boolean(gm&&registered),campaignRegistered:registered,userId:String(userId),role:gm&&registered?'campaign-gm':'owner'};
}
function permissions(character,access){return {isOwner:access.isOwner,canGM:access.gmAllowed,role:access.role,canAdvance:Boolean(character.rulesLedger.levels.length<20&&access.isOwner&&(!character.campaignId||access.campaignRegistered&&character.rulesRuntime.milestones?.some(m=>!m.used&&m.level===character.rulesLedger.levels.length+1))),campaignRegistered:access.campaignRegistered};}
function apply(character,summary,type,p,access){
  if(!access.gmAllowed)fail('This operation requires the campaign GM or the owner of a solo character');
  if(type==='milestone.authorize'){
    if(Object.keys(p).some(k=>!['level','reason'].includes(k))||p.level!==summary.totalLevel+1||p.level>20||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500)fail('Authorize exactly the next level with a milestone reason',422);
    const list=character.rulesRuntime.milestones??=[];
    if(list.some(m=>m.level===p.level))fail('This milestone level is already authorized',422);
    const milestone={level:p.level,reason:p.reason.trim(),authorizedBy:access.userId,authorizedAt:Date.now(),used:false};list.push(milestone);character.rulesRuntime.revision++;
    return {type,milestone};
  }
  if(type==='equipment.award'){
    if(Object.keys(p).some(k=>!['definitionId','quantity','goldCp','reason','spellId'].includes(k))||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||!Number.isSafeInteger(p.goldCp??0)||(p.goldCp??0)<0||(p.goldCp??0)>1000000000)fail('Record an award reason, catalog item and nonnegative integer copper',422);
    const gear=require('../equipment'),items=[];
    if(p.definitionId!==undefined){
      const definition=gear.definition(p.definitionId),n=p.quantity??1;
      if(!Number.isSafeInteger(n)||n<1||n>(definition.stackable?100000:50))fail('Invalid award quantity',422);
      if(definition.magic){if(n!==1)fail('Award magic items as individual identified instances',422);items.push(gear.issue({definitionId:definition.id,...(p.spellId?{spellId:p.spellId}:{})}));}
      else{if(p.spellId!==undefined)fail('Only a Spell Scroll has a spell identity',422);items.push(...require('../equipment/bundles').issue(definition.id,n*(definition.units??1)));}
    }else if(p.quantity!==undefined||p.spellId!==undefined)fail('Quantity or spell identity requires a catalog item',422);
    if(!items.length&&!p.goldCp)fail('Choose an item or a positive copper award',422);
    const balance=character.goldCp+(p.goldCp??0);if(!Number.isSafeInteger(balance))fail('Copper balance is too large',422);
    character.inventory.push(...items);character.goldCp=balance;gear.validateLoadout(character.inventory,character.loadout);
    return {type,instanceIds:items.map(i=>i.instanceId),awardedCp:p.goldCp??0,reason:p.reason.trim(),authorizedBy:access.userId};
  }
  if(type==='spells.discover'){
    if(Object.keys(p).some(k=>!['discoveryId','spellId','reason'].includes(k))||typeof p.discoveryId!=='string'||!p.discoveryId.trim()||p.discoveryId.length>100||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||!summary.spellcasting.shipwright||!require('../system/rules2024/rules').spells.some(s=>s.id===p.spellId&&s.level>0&&s.callings.includes('shipwright')))fail('Record a source ID, Shipwright spell and discovery reason',422);
    character.rulesRuntime.spellDiscoveries??=[];const list=character.rulesRuntime.spellDiscoveries;
    if(list.length>=1000||list.some(d=>d.discoveryId===p.discoveryId&&d.spellId===p.spellId))fail('Discovery is already recorded or the source journal is full',422);
    const discovery={discoveryId:p.discoveryId,spellId:p.spellId,reason:p.reason.trim(),authorizedBy:access.userId};list.push(discovery);character.rulesRuntime.revision++;
    return {type,discovery};
  }
  if(type==='equipment.sell'){
    if(Object.keys(p).some(k=>!['instanceId','quantity','proceedsCp','reason','unequip'].includes(k))||!Number.isSafeInteger(p.quantity)||p.quantity<1||!Number.isSafeInteger(p.proceedsCp)||p.proceedsCp<0||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||p.unequip!==undefined&&typeof p.unequip!=='boolean')fail('Record an owned item, quantity, integer-copper proceeds and sale reason',422);
    const item=character.inventory.find(i=>i.instanceId===p.instanceId);if(!item||p.quantity>item.quantity)fail('Cannot sell an absent item or more than its owned quantity',422);
    const slots=['mainHand','offHand','armor'].filter(slot=>character.loadout[slot]===item.instanceId);
    if((slots.length||item.worn)&&!p.unequip)fail('Explicitly unequip worn or held gear before selling it',422);
    const balance=character.goldCp+p.proceedsCp;if(!Number.isSafeInteger(balance))fail('Copper balance is too large',422);
    for(const slot of slots)character.loadout[slot]=null;if(slots.includes('mainHand'))character.loadout.grip='one';
    item.quantity-=p.quantity;if(!item.quantity)character.inventory=character.inventory.filter(i=>i!==item);
    character.goldCp=balance;require('../equipment').validateLoadout(character.inventory,character.loadout);
    return {type,instanceId:p.instanceId,quantity:p.quantity,proceedsCp:p.proceedsCp,reason:p.reason.trim(),authorizedBy:access.userId,unequippedSlots:slots};
  }
  fail('Unknown GM operation',422);
}
module.exports={context,permissions,apply,gmCommands};
