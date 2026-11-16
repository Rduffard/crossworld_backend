const {randomUUID,randomInt}=require('node:crypto');
const {sumDice}=require('@crossworld/sanguine-engine/dice');
const { 'healing-potion': healingPotion } = require('@crossworld/sanguine-engine/equipment/object-use');
const { purchaseQuote, canCatalogPurchase, catalogUnits } = require('@crossworld/sanguine-engine/equipment/commerce');
const { ammunitionMatches, ammunitionActionOutcome, loadingHandAvailable } = require('@crossworld/sanguine-engine/equipment/ammunition');
const gear=require('./inventory');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Invalid inventory operation fields');}
function quantity(value){if(!Number.isSafeInteger(value)||value<1||value>100000)fail('Choose a positive integer quantity');return value;}
function apply(c,type,p,summary){
  const equipped=id=>['armor','mainHand','offHand'].some(slot=>c.loadout[slot]===id);
  const owned=id=>{const item=c.inventory.find(i=>i.instanceId===id);if(!item)fail('Item is not owned');return item;};
  const remove=item=>{c.inventory=c.inventory.filter(i=>i.instanceId!==item.instanceId);};
  const result={type};
  if(type==='equipment.buy'){
    fields(p,['definitionId','quantity','spellId']);const n=quantity(p.quantity??1),definition=gear.definition(p.definitionId);
    const scroll=definition.purchaseScrollLevel!==undefined;
    if(scroll?!require('../system/rules').spells.some(s=>s.id===p.spellId&&s.level===definition.purchaseScrollLevel):p.spellId!==undefined)fail('Choose the exact registered spell matching this scroll purchase level');
    if(!canCatalogPurchase(definition))fail('This item has no catalog purchase price');
    const quote=purchaseQuote(definition.costCp,n,c.goldCp);
    if(!quote)fail('Insufficient copper for this purchase');
    if(!definition.stackable&&n>50)fail('Buy at most 50 individual items at once');
    const items=scroll?Array.from({length:n},()=>gear.issue({definitionId:'spell-scroll',spellId:p.spellId})):require('./bundles').issue(definition.id,catalogUnits(n,definition.units??1));
    c.inventory.push(...items);c.goldCp=quote.remainingCopper;result.costCp=quote.cost;result.instanceIds=items.map(i=>i.instanceId);
  }else if(type==='equipment.fire'){
    fields(p,['weaponId','ammunitionId','shots','actionId','actionType']);const shots=quantity(p.shots??1),weapon=owned(p.weaponId),ammunition=owned(p.ammunitionId);
    const definition=gear.definition(weapon.definitionId),ammoDefinition=ammunition.definitionId?gear.definition(ammunition.definitionId):null;
    if(!equipped(weapon.instanceId)||definition.kind!=='weapon'||!ammunitionMatches(definition,ammoDefinition))fail('Choose an equipped ammunition weapon and matching ammunition');
    const heldCount=['mainHand','offHand'].filter(slot=>c.loadout[slot]).length;
    if(!loadingHandAvailable(definition.hands,heldCount))fail('A one-handed ammunition weapon needs a free loading hand');
    if(typeof p.actionId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(p.actionId)||['constructor','prototype','__proto__'].includes(p.actionId)||!['attack','bonus','reaction'].includes(p.actionType))fail('Record a consistent action ID and action type');
    const actions=c.rulesRuntime.ammunitionActions??={},previous=actions[p.actionId]??{type:p.actionType,total:0,weapons:{}};
    if(previous.type!==p.actionType)fail('Action type cannot change');
    const outcome=ammunitionActionOutcome({
      shots,actionType:p.actionType,attacksPerAction:summary.attacksPerAction,total:previous.total,
      weaponTotal:previous.weapons[weapon.instanceId]??0,weapon:definition,feats:summary.feats,available:ammunition.quantity,
    });
    if(outcome.error)fail(outcome.error);
    ammunition.quantity=outcome.remaining;if(!ammunition.quantity)remove(ammunition);
    actions[p.actionId]={...previous,total:outcome.usedTotal,weapons:{...previous.weapons,[weapon.instanceId]:outcome.usedWeapon}};
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
        const [count,sides,bonus]=healingPotion.healing;
        result.rolls=Array.from({length:count},()=>randomInt(1,sides+1));result.healing=sumDice(result.rolls,bonus);
        if(require('../combat/vitality/vitality').incapacitated(c.rulesRuntime))fail('Cannot drink your own potion while Incapacitated');
        require('../combat/vitality/vitality').heal(c.rulesRuntime,result.healing);c.rulesRuntime.revision++;
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
