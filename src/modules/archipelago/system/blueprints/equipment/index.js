const items = [
  ...require("./weapons"),
  ...require("./armor"),
  ...require("./shields"),
  ...require('./supplies'),
  ...require('../../rules2024/spellMaterials').items,
  ...require('../../../equipment/magicProfiles'),
];
for(const row of require('./srdGear.json')){
  const existing=items.find(i=>i.id===row.id);
  if(existing){if(row.description)existing.description=row.description;if(row.toolAbility)existing.toolAbility=row.toolAbility;}
  else items.push(row);
}
for(const [id,contents] of Object.entries(require('./packs')))items.find(i=>i.id===id).contents=contents.map(([definitionId,quantity])=>({definitionId,quantity}));
for(const [id,level] of [['spell-scroll-cantrip',0],['spell-scroll-level-1',1]]){
  const item=items.find(i=>i.id===id);item.purchaseScrollLevel=level;item.stackable=false;
  item.description='Choose the exact registered spell when purchasing. Each purchase issues an individually identified Spell Scroll.';
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
module.exports = freeze({ version: 1, items });
