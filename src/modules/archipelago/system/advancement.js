const rules = require('./blueprints/progression');
const { callings, specializations } = require('./blueprints/catalogs');
const packages = require('./blueprints/startingProficiencies');
const attributes = ['might','agility','wit','spirit','resolve','instinct'];
function fail(message) { throw new Error(message); }
function level(value) { if (!Number.isInteger(value) || value < 1 || value > rules.levelCap) fail('Level must be 1–20'); return value; }
function rewardsAt(value) {
 level(value);
 return [['calling',rules.callingLevels],['path',rules.pathLevels],['attribute',rules.attributeLevels]]
  .flatMap(([kind,levels]) => levels.filter(n => n <= value).map(n => ({id:kind+':'+n,kind,level:n})))
  .sort((a,b) => a.level-b.level || a.kind.localeCompare(b.kind));
}
function initialize(calling, scores) {
 const definition = callings.find(c => c.id === calling);
 if (!definition) fail('Unknown Calling');
 if (!attributes.every(key => Number.isInteger(scores[key]) && scores[key] >= 1 && scores[key] <= 20)) fail('Invalid base attributes');
 return {version:1,revision:0,calling,baseAttributes:{...scores},spends:[],exchanges:[],
  passive:{id:calling+':passive',name:definition.passive,status:'historical-text-pending-combat-review'},
  savingThrows:[...packages.callings[calling].saves]};
}
function requireKeys(object, allowed) {
 if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(k => !allowed.includes(k))) fail('Invalid advancement operation');
}
function checkPrerequisites(definition, scores, callingIds, paths) {
 const p = definition.prerequisites ?? {};
 requireKeys(p,['attributes','callingAbilities','pathTiers']);
 for (const [key,value] of Object.entries(p.attributes ?? {})) {
  if (!attributes.includes(key) || !Number.isInteger(value) || scores[key] < value) fail('Attribute prerequisite not met');
 }
 for (const id of p.callingAbilities ?? []) if (!callingIds.includes(id)) fail('Calling prerequisite not met');
 for (const [id,tier] of Object.entries(p.pathTiers ?? {})) if ((paths[id] ?? 0) < tier) fail('Path prerequisite not met');
}
// Pure replay from server-owned base and catalog; callers cannot submit ownership or balances.
function summarize(ledger, currentLevel, catalog = rules) {
 level(currentLevel);
 if (ledger?.version !== 1 || !Array.isArray(ledger.spends) || !callings.some(c=>c.id===ledger.calling)) fail('Progression upgrade requires explicit review');
 const rewards = rewardsAt(currentLevel), used = new Set(), scores = {...ledger.baseAttributes};
 const callingIds = [], paths = {}, converted = new Map();
 if (!Array.isArray(ledger.exchanges) || ledger.exchanges.length > rules.maximumExchanges) fail('Maximum two milestone exchanges');
 for (const exchange of ledger.exchanges) {
  requireKeys(exchange,['rewardId','kind','spentAtLevel']);
  const reward = rewards.find(r=>r.id===exchange.rewardId);
  const at = level(exchange.spentAtLevel);
  if (!reward || reward.kind !== 'attribute' || reward.level > at || at > currentLevel || converted.has(reward.id) || !['calling','path'].includes(exchange.kind)) fail('Invalid milestone exchange');
  converted.set(reward.id,exchange);
 }
 for (const spend of ledger.spends) {
  requireKeys(spend,['rewardId','kind','increases','abilityId','pathId','tier','spentAtLevel']);
  const at = level(spend.spentAtLevel);
  if (at > currentLevel) fail('Spend occurs above current level');
  const reward = rewards.find(r=>r.id===spend.rewardId);
  if (!reward || reward.level > at || used.has(reward.id)) fail('Reward unavailable or already spent');
  used.add(reward.id);
  const exchange = converted.get(reward.id);
  if ((exchange?.kind ?? reward.kind) !== spend.kind || (exchange && exchange.spentAtLevel > at)) fail('Reward conversion is not allowed');
  if (spend.kind === 'attribute') {
   if (spend.abilityId !== undefined || spend.pathId !== undefined || spend.tier !== undefined) fail('Mixed reward spending');
   const entries = Object.entries(spend.increases ?? {});
   if (!(entries.length === 1 && entries[0][1] === 2) && !(entries.length === 2 && entries.every(([,n])=>n===1))) fail('Choose +2 to one or +1 to two attributes');
   for (const [key,n] of entries) {
    if (!attributes.includes(key) || !Number.isInteger(scores[key]) || scores[key]+n > 20) fail('Invalid attribute increase or maximum exceeded');
    scores[key] += n;
   }
  } else {
   if (spend.increases !== undefined) fail('Mixed reward spending');
   let definition;
   if (spend.kind === 'calling') {
    if (spend.pathId !== undefined || spend.tier !== undefined) fail('Mixed reward spending');
    definition = catalog.callingAbilities.find(d=>d.id===spend.abilityId && d.calling===ledger.calling);
    if (!definition || !rules.callingBands.includes(definition.minimumLevel) || definition.minimumLevel > at || callingIds.includes(definition.id)) fail('Calling ability unavailable');
   } else if (spend.kind === 'path') {
    if (spend.abilityId !== undefined) fail('Mixed reward spending');
    if (!specializations.some(p=>p.id===spend.pathId) || !Number.isInteger(spend.tier) || spend.tier !== (paths[spend.pathId] ?? 0)+1 || !rules.pathTierLevels[spend.tier-1] || at < rules.pathTierLevels[spend.tier-1]) fail('Path tiers require sequential ownership and minimum level');
    definition = catalog.pathAbilities.find(d=>d.pathId===spend.pathId && d.tier===spend.tier);
    if (!definition) fail('Path tier content awaits review');
   } else fail('Unknown reward kind');
   checkPrerequisites(definition,scores,callingIds,paths);
   if (spend.kind === 'calling') callingIds.push(definition.id);
   else paths[spend.pathId] = spend.tier;
  }
 }
 return {rewards,unspent:rewards.filter(r=>!used.has(r.id)).map(r=>({...r,kind:converted.get(r.id)?.kind ?? r.kind})),exchanges:ledger.exchanges.length,attributes:scores,callingAbilities:callingIds,pathTiers:paths};
}
function advance(ledger, currentLevel, operation, catalog = rules) {
 requireKeys(operation,['expectedRevision','level','spends','exchanges']);
 summarize(ledger,currentLevel,catalog);
 if (operation.expectedRevision !== ledger.revision) fail('Progression changed; reload before advancing');
 const nextLevel = operation.level ?? currentLevel;
 level(nextLevel);
 if (nextLevel < currentLevel) fail('Level decreases require an explicit respec');
 if (operation.spends !== undefined && (!Array.isArray(operation.spends) || operation.spends.length > 19)) fail('Invalid reward spends');
 const spends = (operation.spends ?? []).map(spend=>{
  requireKeys(spend,['rewardId','kind','increases','abilityId','pathId','tier']);
  return {...spend,spentAtLevel:nextLevel};
 });
 if (operation.exchanges !== undefined && (!Array.isArray(operation.exchanges) || operation.exchanges.length > 2)) fail('Invalid milestone exchanges');
 const exchanges = (operation.exchanges ?? []).map(exchange=>{
  requireKeys(exchange,['rewardId','kind']);
  if (ledger.spends.some(s=>s.rewardId===exchange.rewardId)) fail('Spent milestones require an explicit respec');
  return {...exchange,spentAtLevel:nextLevel};
 });
 const next = {...ledger,revision:ledger.revision+1,spends:[...ledger.spends,...spends],exchanges:[...ledger.exchanges,...exchanges]};
 return {ledger:next,level:nextLevel,summary:summarize(next,nextLevel,catalog)};
}
module.exports = {rewardsAt,initialize,summarize,advance};
