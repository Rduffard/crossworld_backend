const {randomUUID,randomInt}=require('node:crypto');
const gear=require('./index');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Invalid inventory operation fields');}
function quantity(value){if(!Number.isSafeInteger(value)||value<1||value>100000)fail('Choose a positive integer quantity');return value;}
function apply(c,type,p){
  const equipped=id=>['armor','mainHand','offHand'].some(slot=>c.loadout[slot]===id);
  const owned=id=>{const item=c.inventory.find(i=>i.instanceId===id);if(!item)fail('Item is not owned');return item;};
  const remove=item=>{c.inventory=c.inventory.filter(i=>i.instanceId!==item.instanceId);};
  const result={type};
  if(type==='equipment.buy'){
    fields(p,['definitionId','quantity','spellId']);const n=quantity(p.quantity??1),definition=gear.definition(p.definitionId);
    const scroll=definition.purchaseScrollLevel!==undefined;
    if(scroll?!require('../system/rules2024/rules').spells.some(s=>s.id===p.spellId&&s.level===definition.purchaseScrollLevel):p.spellId!==undefined)fail('Choose the exact registered spell matching this scroll purchase level');
    if(!Number.isSafeInteger(definition.costCp)||definition.costCp<0)fail('This item has no catalog purchase price');
    const cost=definition.costCp*n,balance=c.goldCp;
    if(!Number.isSafeInteger(cost)||cost<0||!Number.isSafeInteger(balance)||cost>balance)fail('Insufficient copper for this purchase');
    if(!definition.stackable&&n>50)fail('Buy at most 50 individual items at once');
    const items=scroll?Array.from({length:n},()=>gear.issue({definitionId:'spell-scroll',spellId:p.spellId})):require('./bundles').issue(definition.id,n*(definition.units??1));
    c.inventory.push(...items);c.goldCp=balance-cost;result.costCp=cost;result.instanceIds=items.map(i=>i.instanceId);
  }else if(type==='equipment.fire'){
    fields(p,['weaponId','ammunitionId','shots','actionId','actionType']);const shots=quantity(p.shots??1),weapon=owned(p.weaponId),ammunition=owned(p.ammunitionId);
    const definition=gear.definition(weapon.definitionId),ammoDefinition=ammunition.definitionId?gear.definition(ammunition.definitionId):null;
    if(!equipped(weapon.instanceId)||definition.kind!=='weapon'||!definition.ammunitionType||!ammoDefinition||ammoDefinition.kind==='weapon'||ammoDefinition.ammunitionType!==definition.ammunitionType)fail('Choose an equipped ammunition weapon and matching ammunition');
    if(definition.hands===1&&['mainHand','offHand'].filter(slot=>c.loadout[slot]).length>1)fail('A one-handed ammunition weapon needs a free loading hand');
    if(typeof p.actionId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(p.actionId)||['constructor','prototype','__proto__'].includes(p.actionId)||!['attack','bonus','reaction'].includes(p.actionType))fail('Record a consistent action ID and action type');
    const summary=require('../system/rules2024').replay(c.rulesLedger),actions=c.rulesRuntime.ammunitionActions??={},previous=actions[p.actionId]??{type:p.actionType,total:0,weapons:{}};
    if(previous.type!==p.actionType)fail('Action type cannot change');
    const maximum=p.actionType==='attack'?summary.attacksPerAction:1;
    const ignoresLoading=summary.feats.includes('powder-drill')&&['pistol','musket'].includes(definition.id);
    if(previous.total+shots>maximum||definition.loading&&!ignoresLoading&&(previous.weapons[weapon.instanceId]??0)+shots>1)fail('Extra Attack and Loading limits exceeded for this action');
    if(ammunition.quantity<shots)fail('Insufficient ammunition');
    ammunition.quantity-=shots;if(!ammunition.quantity)remove(ammunition);
    actions[p.actionId]={...previous,total:previous.total+shots,weapons:{...previous.weapons,[weapon.instanceId]:(previous.weapons[weapon.instanceId]??0)+shots}};
    c.rulesRuntime.ammunitionActions=actions;c.rulesRuntime.revision++;result.shots=shots;
  }else if(type==='equipment.consume'){
    fields(p,['instanceId','quantity']);const n=quantity(p.quantity??1),item=owned(p.instanceId),definition=item.definitionId?gear.definition(item.definitionId):null;
    if(definition?.magic)fail('Use the identified magic item or scroll command so charge and destruction rules resolve together');
    if(equipped(item.instanceId))fail('Unequip an item before consuming it');
    if(item.chargesCurrent!==undefined){if(n>item.chargesCurrent)fail('Insufficient item charges');item.chargesCurrent-=n;}
    else{
      if(n>item.quantity)fail('Insufficient item quantity');
      if(definition&&!definition.ammunitionType&&!definition.consumable)fail('This item is not a consumable');
      if(definition?.consumable==='healing-potion'){
        if(n!==1)fail('Drink one healing potion per Bonus Action');
        result.rolls=[randomInt(1,5),randomInt(1,5)];result.healing=result.rolls[0]+result.rolls[1]+2;
        if(require('../system/rules2024/vitality').incapacitated(c.rulesRuntime))fail('Cannot drink your own potion while Incapacitated');
        require('../system/rules2024/vitality').heal(c.rulesRuntime,result.healing);c.rulesRuntime.revision++;
      }
      item.quantity-=n;if(!item.quantity)remove(item);
    }
  }else if(type==='equipment.split'){
    fields(p,['instanceId','quantity']);const item=owned(p.instanceId),n=quantity(p.quantity);
    if(equipped(item.instanceId)||n>=item.quantity||item.definitionId&&!gear.definition(item.definitionId).stackable)fail('Split only a non-equipped stack, leaving at least one');
    item.quantity-=n;const split={...structuredClone(item),instanceId:randomUUID(),quantity:n};c.inventory.push(split);result.instanceId=split.instanceId;
  }else if(type==='equipment.merge'){
    fields(p,['from','to']);if(p.from===p.to)fail('Choose two different stacks');const from=owned(p.from),to=owned(p.to);
    if(equipped(from.instanceId)||equipped(to.instanceId)||from.definitionId&&!gear.definition(from.definitionId).stackable)fail('Merge only non-equipped stackable items');
    if(['definitionId','customName','notes','chargesCurrent'].some(k=>from[k]!==to[k]))fail('Only identical stacks with matching charge state can merge');
    if(!Number.isSafeInteger(from.quantity+to.quantity))fail('Merged quantity is too large');
    to.quantity+=from.quantity;remove(from);
  }else if(type==='equipment.preset.save'){
    fields(p,['id','name','loadout']);if(typeof p.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)fail('Choose a preset ID and name');
    gear.validateLoadout(c.inventory,p.loadout);c.presets??=[];
    if(!c.presets.some(s=>s.id===p.id)&&c.presets.length>=10)fail('At most ten equipment presets');
    c.presets=[...c.presets.filter(s=>s.id!==p.id),{id:p.id,name:p.name.trim(),loadout:structuredClone(p.loadout)}];
  }else if(type==='equipment.preset.apply'){
    fields(p,['id']);const preset=c.presets?.find(s=>s.id===p.id);if(!preset)fail('Unknown equipment preset');
    gear.validateLoadout(c.inventory,preset.loadout);c.loadout=structuredClone(preset.loadout);
  }else fail('Unknown inventory operation');
  gear.validateLoadout(c.inventory,c.loadout);
  return result;
}
module.exports={apply};
