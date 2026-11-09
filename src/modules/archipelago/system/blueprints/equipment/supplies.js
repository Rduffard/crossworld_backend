// Exact first-edition mandatory supplies from docs/character-system/equipment.md.
// Prices/weights refer to one inventory unit; ammunition purchase units are packs.
const rows=[
  ['healer-kit',"Healer's Kit",500,3,{charges:10}],
  ['healing-potion','Potion of Healing',5000,0.5,{consumable:'healing-potion'}],
  ['rope','Rope (50 feet)',100,5,{}],
  ['arrows','Arrows (20)',100,1,{ammunitionType:'arrow',units:20}],
  ['bolts','Bolts (20)',100,1.5,{ammunitionType:'bolt',units:20}],
  ['bullets','Bullets (10)',300,2,{ammunitionType:'bullet',units:10}],
  ['thieves-tools',"Thieves' Tools",2500,1,{}],
  ['herbalism-kit','Herbalism Kit',500,3,{}],
  ['navigator-tools',"Navigator's Tools",2500,2,{}],
  ['carpenter-tools',"Carpenter's Tools",800,6,{}],
  ['mason-tools',"Mason's Tools",1000,8,{}],
  ['smith-tools',"Smith's Tools",2000,8,{}],
  ['tinker-tools',"Tinker's Tools",5000,10,{}],
  ['poisoner-kit',"Poisoner's Kit",5000,2,{}],
  ['calligrapher-tools',"Calligrapher's Supplies",1000,5,{}],
  ['spellbook','Spellbook',5000,3,{}],
  ['component-pouch','Component Pouch',2500,2,{focus:'component-pouch'}],
  ['arcane-focus-crystal','Crystal Arcane Focus',1000,1,{focus:'arcane'}],
  ['druidic-focus','Wooden Druidic Focus',500,1,{focus:'druidic'}],
  ['holy-symbol','Holy Symbol',500,1,{focus:'holy'}],
];
module.exports=rows.map(([id,name,costCp,weightLb,properties])=>({id,name,kind:'gear',version:1,costCp,weightLb,
  stackable:!properties.charges,automation:{melee:false},...properties,
  source:{document:'SA-CHAR-1 equipment.md',section:'Other gear and referenced tables'}}));
