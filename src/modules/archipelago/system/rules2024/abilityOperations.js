const {randomInt}=require('node:crypto');
function fail(message){throw Object.assign(new Error(message),{statusCode:422});}
const definitions={
  'path:plaguewarden:inoculated:6':[['grant','Inoculated: healed recipient save','No action',[],'rider-inoculate']],
  'calling:navigator:favored-enemy:1':[['hit','Hunter\'s Mark hit damage','No action',[],'rider-mark'],['move','Move Hunter\'s Mark after target drops','Bonus Action',[],'rider-mark-transfer']],
  'path:gray-net:superior-hunter-s-prey:11':[['secondary','Superior Gray Net prey damage','No action',[],'rider-mark-secondary']],
  'calling:warden:radiant-strikes:11':[['hit','Radiant Strikes','No action',[],'rider-radiant']],
  'calling:doctor:blessed-strikes:7':[['weapon','Divine Strike','No action',[],'rider-divine'],['cantrip','Potent Spellcasting','No action',[],'rider-potent']],
  'calling:doctor:improved-blessed-strikes:14':[['vitality','Potent Spellcasting vitality','No action',[],'rider-vitality']],
  'path:omen-diver:elemental-affinity:6':[['damage','Elemental Affinity damage','No action',[],'rider-affinity']],
  'path:powder-saint:potent-cantrip:3':[['half','Potent Cantrip: avoided damage','No action',[],'rider-cantrip-half']],
  'path:powder-saint:empowered-evocation:10':[['damage','Empowered Evocation damage','No action',[],'rider-evocation']],
  'path:iron-suppressor:suppressing-fire:3':[['hit','Suppressing Fire','No action',[['iron-suppressor:suppression',1]],'suppressor-hit']],
  'path:iron-suppressor:crossing-denied:10':[['attack','Crossing Denied','Reaction',[['iron-suppressor:suppression',1]],'suppressor-crossing']],
  'path:iron-suppressor:hold-the-corridor:18':[['hold','Hold the Corridor','Bonus Action',[['iron-suppressor:hold-corridor',1]],'suppressor-hold']],
  'path:brass-outrider:ride-the-recoil:3':[['move','Ride the Recoil','No action',[['brass-outrider:outrider',1]],'outrider-recoil']],
  'path:brass-outrider:passing-shot:10':[['hit','Passing Shot','No action',[],'outrider-passing']],
  'path:brass-outrider:break-pursuit:15':[['move','Break Pursuit','Reaction',[['brass-outrider:outrider',1]],'outrider-break']],
  'path:brass-outrider:over-the-horizon:18':[['attack','Over the Horizon','Bonus Action',[['brass-outrider:horizon',1]],'outrider-horizon']],
  'path:memory-echo:borrowed-voice:3':[['link','Borrowed Voice: telepathy','No action',[],'echo-link'],['save','Borrowed Voice: failed save','Reaction',[['memory-echo:echo',1]],'echo-save']],
  'path:memory-echo:recalled-pattern:6':[['pattern','Recalled Pattern','No action',[['tidecaller:sorcery-points',2]],'echo-pattern']],
  'path:memory-echo:shared-recollection:14':[['share','Shared Recollection','Action',[['memory-echo:echo',1]],'echo-share']],
  'path:memory-echo:unwritten-self:18':[['save','Unwritten Self','Reaction',[['memory-echo:unwritten',1]],'echo-unwritten']],
  'path:tempest-heart:storm-pulse:3':[['pulse','Storm Pulse','No action',[['tempest-heart:pulse',1]],'tempest-pulse']],
  'path:tempest-heart:conductive-soul:6':[['convert','Conductive Soul: next spell conversion','Bonus Action',[['tidecaller:sorcery-points',2]],'tempest-convert'],['damage','Conductive Soul: damage bonus','No action',[],'tempest-damage']],
  'path:tempest-heart:living-tempest:18':[['storm','Living Tempest','Bonus Action',[['tempest-heart:tempest',1]],'tempest-live']],
  'path:starwake-pilot:chart-the-passage:3':[['guide','Chart the Passage','Bonus Action',[['starwake-pilot:passage',1]],'starwake-guide']],
  'path:starwake-pilot:converging-routes:11':[['hit','Converging Routes','No action',[],'starwake-hit']],
  'path:starwake-pilot:homeward-star:15':[['home','Homeward Star','Action',[['starwake-pilot:homeward',1]],'starwake-home']],
  'path:mangrove-stalker:rooted-ambush:3':[['hit','Rooted Ambush','No action',[['mangrove-stalker:thicket',1]],'mangrove-hit']],
  'path:mangrove-stalker:patient-predator:11':[['move','Patient Predator','No action',[],'mangrove-predator']],
  'path:mangrove-stalker:vanish-into-green:15':[['vanish','Vanish into Green','Reaction',[['mangrove-stalker:thicket',1]],'mangrove-vanish']],
  'path:thunderhide:stormhide:3':[['leap','Stormhide leap','Bonus Action',[['thunderhide:stormhide',1]],'stormhide-leap'],['hit','Stormhide: Rage hit damage','No action',[],'reaver-path-hit']],
  'path:thunderhide:weather-the-blow:6':[['retaliate','Weather the Blow','Reaction',[],'stormhide-retaliate']],
  'path:thunderhide:walking-storm:14':[['storm','Walking Storm','Bonus Action',[['thunderhide:stormhide',1]],'stormhide-walking'],['pulse','Walking Storm: enemy turn','No action',[],'stormhide-pulse']],
  'path:chainbreaker:break-their-hold:3':[['escape','Break Their Hold: ally escape','Bonus Action',[['chainbreaker:freedom',1]],'chainbreaker-escape'],['hit','Break Their Hold: Rage hit','No action',[],'reaver-path-hit']],
  'path:chainbreaker:rally-the-bound:10':[['rally','Rally the Bound','Action',[['chainbreaker:freedom',1]],'chainbreaker-rally']],
  'path:chainbreaker:none-shall-kneel:14':[['save','None Shall Kneel','Reaction',[['chainbreaker:none-kneel',1]],'chainbreaker-kneel']],
  'path:reef-colossus:colossus-stance:3':[['stance','Colossus Stance','Bonus Action',[['reef-colossus:colossus',1]],'colossus-stance']],
  'path:reef-colossus:reef-skin:6':[['suppress','Suppress Reef Skin','No action',[],'colossus-suppress']],
  'path:reef-colossus:deckshaker:10':[['shake','Deckshaker','Action',[['reef-colossus:colossus',1]],'colossus-deck']],
  'path:oath-of-the-free-port:break-the-chain:3':[['break','Break the Chain','Action',[['warden:channel-divinity',1]],'freeport-break']],
  'path:oath-of-the-free-port:no-captive-left:15':[['reroll','No Captive Left','Reaction',[['warden:lay-on-hands',5]],'freeport-reroll']],
  'path:oath-of-the-free-port:open-harbor:20':[['harbor','Open Harbor','Bonus Action',[['oath-of-the-free-port:open-harbor',1]],'freeport-harbor']],
  'path:lantern-vigil:light-the-watch:3':[['watch','Light the Watch','Bonus Action',[['warden:channel-divinity',1]],'vigil-watch'],['hit','Watch: first weapon hit','No action',[],'vigil-hit']],
  'path:lantern-vigil:watchfire:15':[['cure','Watchfire: end Undead charm','Action',[['warden:lay-on-hands',5]],'vigil-cure']],
  'path:lantern-vigil:dawn-at-sea:20':[['dawn','Dawn at Sea','Bonus Action',[['lantern-vigil:dawn',1]],'vigil-dawn'],['damage','Dawn: Undead turn damage','No action',[],'vigil-dawn-damage']],
  'path:iron-covenant:covenant-of-steel:3':[['steel','Covenant of Steel','Bonus Action',[['warden:channel-divinity',1]],'covenant-steel'],['sentinel','Sentinel protection','Reaction',[],'covenant-sentinel']],
  'path:iron-covenant:unyielding-standard:20':[['standard','Unyielding Standard','Bonus Action',[['iron-covenant:standard',1]],'covenant-standard'],['grant','Standard: ally turn temporary Health','No action',[],'covenant-grant']],
  'path:sanguine-conduit:blood-price:3':[['price','Blood Price','Bonus Action',[['sanguine-conduit:conduit',1]],'conduit-price']],
  'path:sanguine-conduit:measured-sacrifice:6':[['sacrifice','Measured Sacrifice','Bonus Action',[['sanguine-conduit:transfusion',1]],'conduit-sacrifice']],
  'path:sanguine-conduit:vital-circuit:14':[['circuit','Vital Circuit','Reaction',[],'conduit-circuit']],
  'path:sanguine-conduit:unbroken-current:18':[],
  'path:black-flag-envoy:terms-of-surrender:3':[['move','Terms of Surrender','Bonus Action',[['black-flag-envoy:envoy',1]],'envoy-move']],
  'path:black-flag-envoy:crew-before-crown:9':[['save','Crew Before Crown','Bonus Action',[['black-flag-envoy:envoy',1]],'envoy-save']],
  'path:black-flag-envoy:binding-parley:13':[['parley','Binding Parley','Action',[['black-flag-envoy:parley',1]],'envoy-parley']],
  'path:black-flag-envoy:all-hands:17':[['crew','All Hands','Bonus Action',[['black-flag-envoy:envoy',2]],'envoy-all']],
  'path:hollow-lantern:read-the-wake:3':[['study','Read the Wake','Bonus Action',[['hollow-lantern:lantern',1]],'lantern-study']],
  'path:hollow-lantern:unmask-the-false:9':[['detect','Unmask the False','Action',[['hollow-lantern:lantern',1]],'lantern-detect'],['search','Search','Bonus Action',[],'lantern-search']],
  'path:hollow-lantern:lantern-in-the-fog:13':[['mark','Lantern in the Fog','Reaction',[['hollow-lantern:lantern',1]],'lantern-mark']],
  'path:hollow-lantern:the-last-tell:17':[['reroll','The Last Tell','No action',[['hollow-lantern:last-tell',1]],'lantern-reroll']],
  'path:saltglass-duelist:open-challenge:3':[['parry','Open Challenge','Reaction',[['saltglass-duelist:duel',1]],'duelist-parry']],
  'path:saltglass-duelist:saltglass-footwork:9':[['footwork','Saltglass Footwork','No action',[],'duelist-footwork']],
  'path:saltglass-duelist:answer-in-steel:13':[['answer','Answer in Steel','Part of triggering Reaction',[],'duelist-answer']],
  'path:saltglass-duelist:perfect-measure:17':[['convert','Perfect Measure','No action',[['saltglass-duelist:perfect-measure',1]],'duelist-perfect']],
  'path:iron-covenant:take-the-burden:15':[['main','Take the Burden','Reaction',[['iron-covenant:covenant',1]],'burden']],
  'path:keeper-of-last-breaths:stay-the-crossing:3':[['main','Stay the Crossing','Reaction',[['keeper-of-last-breaths:vigil',1]],'keeper-stabilize']],
  'path:keeper-of-last-breaths:witness-against-oblivion:6':[['main','Witness Against Oblivion','Action',[['doctor:channel-divinity',1]],'keeper-heal']],
  'path:keeper-of-last-breaths:one-more-dawn:17':[['main','One More Dawn','Reaction',[['keeper-of-last-breaths:one-dawn',1]],'keeper-dawn']],
  'path:plaguewarden:contain-the-fever:3':[['antidote','Contain the Fever: antidote','Action',[['doctor:channel-divinity',1]],'plague-antidote'],['quarantine','Contain the Fever: quarantine','Action',[['doctor:channel-divinity',1]],'plague-quarantine']],
  'path:plaguewarden:clean-bill-of-health:17':[['main','Clean Bill of Health','Action',[['plaguewarden:clean-bill',1]],'clean-bill']],
  'path:cinder-artillerist:measured-charge:3':[['detonate','Measured Charge','Action',[['cinder-artillerist:charge',1]],'measured-charge']],
  'path:cinder-artillerist:grand-battery:18':[['detonate','Grand Battery','Action',[['cinder-artillerist:charge',2],['cinder-artillerist:battery',1]],'grand-battery']],
  'calling:gunslinger:second-wind:1':[['main','Recover Health','Bonus Action',[['gunslinger:second-wind',1]],'second-wind']],
  'calling:gunslinger:action-surge:2':[['main','Action Surge','No action',[['gunslinger:action-surge',1]],'action-surge']],
  'calling:gunslinger:tactical-mind:2':[['main','Tactical Mind','No action',[['gunslinger:second-wind',1]],'tactical-mind']],
  'calling:gunslinger:indomitable:9':[['main','Reroll a failed save','No action',[['gunslinger:indomitable',1]],'indomitable']],
  'calling:corsair:cunning-action:2':[['dash','Dash','Bonus Action',[],'corsair-dash'],['disengage','Disengage','Bonus Action',[],'corsair-disengage'],['hide','Hide','Bonus Action',[],'corsair-hide']],
  'calling:corsair:steady-aim:3':[['main','Steady Aim','Bonus Action',[],'corsair-aim'],['attack','Resolve Steady Aim attack','No action',[],'corsair-aim-attack']],
  'calling:corsair:uncanny-dodge:5':[['main','Uncanny Dodge','Reaction',[],'uncanny-dodge']],
  'calling:corsair:stroke-of-luck:20':[['main','Stroke of Luck','No action',[['corsair:stroke-of-luck',1]],'stroke-luck']],
  'calling:reaver:rage:1':[['main','Enter Rage','Bonus Action',[['reaver:rage',1]],'rage']],
  'calling:tidecaller:innate-sorcery:1':[['main','Innate Sorcery','Bonus Action',[['tidecaller:innate-sorcery',1]],'innate']],
  'calling:navigator:tireless:10':[['main','Tireless','Action',[['navigator:tireless',1]],'tireless']],
  'calling:navigator:nature-s-veil:14':[['main','Nature’s Veil','Bonus Action',[['navigator:natures-veil',1]],'veil']],
  'calling:doctor:channel-divinity:2':[['spark-heal','Divine Spark: healing','Magic action',[['doctor:channel-divinity',1]],'spark-heal'],['spark-damage','Divine Spark: damage','Magic action',[['doctor:channel-divinity',1]],'spark-damage'],['turn-undead','Turn Undead','Magic action',[['doctor:channel-divinity',1]],'turn-undead']],
  'calling:warden:lay-on-hands:1':[['heal','Lay On Hands','Bonus Action',[],'lay-heal'],['poison','End Poisoned','Bonus Action',[['warden:lay-on-hands',5]],'lay-poison']],
  'calling:warden:restoring-touch:14':[['cure','Restoring Touch','Bonus Action',[],'warden-touch']],
  'calling:warden:channel-divinity:3':[['sense','Divine Sense','Bonus Action',[['warden:channel-divinity',1]],'sense']],
  'calling:warden:abjure-foes:9':[['main','Abjure Foes','Magic action',[['warden:channel-divinity',1]],'abjure']],
  'path:omen-diver:dragon-wings:14':[['main','Manifest Wings','Bonus Action',[['omen-diver:wings',1]],'wings']],
  'path:bloodwake:intimidating-presence:14':[['main','Intimidating Presence','Bonus Action',[['bloodwake:presence',1]],'presence']],
  'path:bloodwake:retaliation:10':[['attack','Retaliation','Reaction',[],'bloodwake-retaliation']],
  'path:leviathan-anchor:sacred-weapon:3':[['main','Sacred Weapon','Attack action rider',[['warden:channel-divinity',1]],'sacred']],
  'path:leviathan-anchor:holy-nimbus:20':[['main','Holy Nimbus','Bonus Action',[['leviathan-anchor:nimbus',1]],'nimbus'],['pulse','Holy Nimbus: enemy turn','No action',[],'nimbus-pulse']],
  'path:sanctuary-hand:preserve-life:3':[['main','Preserve Life','Magic action',[['doctor:channel-divinity',1]],'preserve-life']],
  'path:reef-knife:fast-hands:3':[['finesse','Fast Hands: tools or pocket','Bonus Action',[],'corsair-finesse']],
  'path:gray-net:superior-hunter-s-defense:15':[['main','Superior Defense','Reaction',[],'gray-defense']],
  'path:drydock-ghost:ghost-patch:3':[['repair','Ghost Patch: repair','Action',[['drydock-ghost:ghost-work',1]],'ghost-repair'],['sabotage','Conceal tampering','Action',[['drydock-ghost:ghost-work',1]],'ghost-sabotage']],
  'path:drydock-ghost:paid-in-scrap:6':[['salvage','Salvage wreck','10 minutes',[['drydock-ghost:salvage',1]],'salvage']],
  'path:drydock-ghost:silent-keel:10':[['main','Silent Keel','Action',[['drydock-ghost:ghost-work',1]],'silent-keel']],
  'path:drydock-ghost:unseen-passage:14':[['main','Unseen Passage','Bonus Action',[['drydock-ghost:ghost-work',2]],'unseen-passage'],['inside','End turn inside a structure','No action',[],'unseen-consequence']],
  'path:storm-broker:barometer-instinct:3':[['fog','Fog Squall','Bonus Action',[['storm-broker:squall',1]],'squall'],['crosswind','Crosswind Squall','Bonus Action',[['storm-broker:squall',1]],'squall'],['surge','Surge Squall','Bonus Action',[['storm-broker:squall',1]],'squall']],
  'path:storm-broker:eye-of-the-bargain:15':[['resist','Resist Lightning/Thunder instance','Reaction',[['storm-broker:squall',1]],'broker-resist']],
  'path:storm-broker:captain-s-credit:11':[['grant','Captain\'s Credit','No action',[],'broker-credit']],
  'path:field-surgeon:clinical-doctrine:3':[['triage','Triage','Action',[['field-surgeon:triage',1]],'triage']],
  'path:field-surgeon:battlefield-procedure:6':[['toxicology','Triage: antidote','Action',[['field-surgeon:triage',1]],'triage-antidote']],
  'path:field-surgeon:impossible-operation:17':[['main','Impossible Operation','Action',[['field-surgeon:operation',1],['doctor:channel-divinity',1]],'impossible-operation']],
  'path:breakwater:breakwater-doctrine:3':[['main','Create barrier','Action',[['breakwater:bastion',1]],'barrier']],
  'path:breakwater:reinforced-anchorage:6':[['reduce','Reduce damage by barrier','Reaction',[['breakwater:bastion',1]],'barrier-reduce']],
  'path:breakwater:hold-against-the-sea:14':[['free-barrier','Create one-hour barrier','Action',[['breakwater:hold-sea',1]],'barrier-hour']],
  'path:sparkwrite-aetherist:aether-relay:3':[['place','Place Aether Relay','Bonus Action',[['sparkwrite-aetherist:relay',1]],'relay-place'],['move','Move mobile relay','Bonus Action',[],'relay-move']],
  'path:sparkwrite-aetherist:grounding-circuit:6':[['proximity','Record Grounding Circuit proximity','No action',[],'relay-proximity']],
  'path:sparkwrite-aetherist:capacitor-discharge:10':[['discharge','Capacitor Discharge','Action',[['sparkwrite-aetherist:relay',1]],'relay-discharge']],
};
function preview(handler,summary){
  const {callingLevels:levels,attributeModifiers,spellcasting}=summary;
  if(handler==='envoy-parley')return {save:{attribute:'instinct',dc:8+summary.trainingBonus+attributeModifiers.spirit}};
  if(handler==='triage'){
    const level=levels.doctor;
    return {roll:{label:'Healing',count:level>=17?6:level>=6?3:2,sides:8,bonus:level,unit:'Health'},kitCharges:1};
  }
  if(handler==='triage-antidote')return {kitCharges:1};
  if(handler==='impossible-operation')return {kitCharges:5};
  if(handler==='ghost-repair'){
    const level=levels.shipwright;
    return {roll:{label:'Object repair',count:level>=14?5:level>=10?4:level>=6?3:2,sides:8,bonus:level,unit:'Health'}};
  }
  if(handler==='second-wind')return {roll:{label:'Healing',count:1,sides:10,bonus:levels.gunslinger,unit:'Health'}};
  if(handler==='tactical-mind')return {roll:{label:'Failed check bonus',count:1,sides:10,bonus:0}};
  if(handler==='tireless')return {roll:{label:'Temporary Health',count:1,sides:8,bonus:attributeModifiers.instinct}};
  if(handler==='spark-damage'||handler==='spark-heal'){
    const level=levels.doctor,healing=handler==='spark-heal';
    const attribute=summary.pathSelections.doctor?.clinicalAttribute??'instinct';
    return {
      roll:{label:healing?'Healing':'Damage',count:level>=18?4:level>=13?3:level>=7?2:1,sides:8,bonus:attributeModifiers[attribute],
        ...(healing?{unit:'Health',maximum:summary.paths.doctor==='sanctuary-hand'&&level>=17}:{})},
      ...(!healing?{save:{attribute:'resolve',dc:spellcasting.doctor.saveDC}}:{}),
    };
  }
  if(handler==='turn-undead'){
    const attribute=summary.pathSelections.doctor?.clinicalAttribute??'instinct';
    return {save:{attribute:'instinct',dc:spellcasting.doctor.saveDC},
      ...(levels.doctor>=5?{roll:{label:'Optional Sear Undead damage',count:Math.max(1,attributeModifiers[attribute]),sides:8,bonus:0}}:{})};
  }
  if(handler==='abjure')return {save:{attribute:'instinct',dc:spellcasting.warden.saveDC}};
  if(handler==='plague-quarantine')return {save:{attribute:'resolve',dc:spellcasting.doctor.saveDC}};
  if(handler==='clean-bill')return {roll:{label:'Healing',count:6,sides:8,bonus:levels.doctor,unit:'Health'},kitCharges:1};
  if(handler==='relay-discharge')return {
    roll:{label:'Lightning damage',count:levels.shipwright>=14?6:4,sides:8,bonus:0},
    save:{attribute:'agility',dc:spellcasting.shipwright.saveDC},
  };
  if(handler==='measured-charge'||handler==='grand-battery'){
    const level=levels.gunslinger;
    return {
      roll:{label:'Fire damage per area',count:handler==='grand-battery'?6:level>=15?5:level>=7?3:2,sides:6,bonus:0},
      save:{attribute:'agility',dc:8+summary.trainingBonus+attributeModifiers.wit},
    };
  }
  if(handler==='presence')return {save:{attribute:'instinct',dc:8+summary.trainingBonus+attributeModifiers.might}};
  if(handler==='barrier-reduce')return {roll:{label:'Damage reduction',count:levels.shipwright>=14?4:2,sides:8,bonus:attributeModifiers.wit}};
  if(handler==='unseen-consequence')return {roll:{label:'Force damage',count:1,sides:10,bonus:0}};
  if(handler==='starwake-hit')return {roll:{label:'Extra damage',count:1,sides:8,bonus:0}};
  if(handler==='mangrove-hit')return {
    roll:{label:'Extra Piercing damage',count:levels.navigator>=11?2:1,sides:6,bonus:0},
    ...(summary.pathSelections.navigator?.pathDiscipline==='snare'?{save:{attribute:'might',dc:spellcasting.navigator.saveDC}}:{}),
  };
  if(handler==='stormhide-leap'&&levels.reaver>=10)return {save:{label:'Thunderous Landing',attribute:'might',dc:8+summary.trainingBonus+attributeModifiers.might}};
  if(handler==='stormhide-pulse')return {
    roll:{label:'Damage at the start of an enemy turn',count:3,sides:6,bonus:0},
    save:{attribute:'resolve',dc:8+summary.trainingBonus+attributeModifiers.might},
  };
  if(handler==='colossus-deck')return {
    roll:{label:'Bludgeoning damage',count:levels.reaver>=14?5:3,sides:8,bonus:0},
    save:{attribute:'might',dc:8+summary.trainingBonus+attributeModifiers.might},
  };
  if(handler==='chainbreaker-rally')return {roll:{label:'Temporary Health',count:1,sides:8,bonus:attributeModifiers.resolve}};
  if(handler==='suppressor-hit')return {
    roll:{label:'Primary target extra damage',count:1,sides:levels.gunslinger>=15?10:levels.gunslinger>=7?8:6,bonus:0},
    save:{attribute:'resolve',dc:8+summary.trainingBonus+attributeModifiers.agility+(summary.corridorDcBonus??0)},
  };
  if(handler==='outrider-passing')return {roll:{label:'Extra damage',count:1,sides:8,bonus:0}};
  if(handler==='echo-save')return {roll:{label:'Failed save bonus',count:1,sides:6,bonus:0}};
  if(handler==='vigil-hit')return {roll:{label:'Extra damage',count:levels.warden>=15?2:1,sides:6,bonus:0}};
  if(handler==='vigil-dawn-damage')return {fixed:{label:'Damage',amount:Math.max(1,summary.trainingBonus+attributeModifiers.spirit),unit:'Radiant'}};
  if(handler==='tempest-pulse'||handler==='tempest-damage')return {
    fixed:{label:handler==='tempest-pulse'?'Damage':'Spell damage bonus',
      amount:handler==='tempest-pulse'?Math.max(1,attributeModifiers.spirit):attributeModifiers.spirit,
      unit:summary.pathSelections.tidecaller.pathDiscipline},
  };
}
function list(summary){
  return summary.features.flatMap(f=>{
    if(f.action&&!Object.hasOwn(definitions,f.id))throw new Error('Missing explicit ability operation: '+f.id);
    const entries=definitions[f.id]??[];
    return entries.filter(e=>(e[4]!=='rider-divine'||summary.pathSelections.doctor?.blessedStrikes==='divine-strike')&&(!['rider-potent','rider-vitality'].includes(e[4])||summary.pathSelections.doctor?.blessedStrikes==='potent-spellcasting')&&(e[4]!=='covenant-sentinel'||summary.pathSelections.warden?.pathDiscipline==='sentinel')&&(e[4]!=='triage-antidote'||summary.pathSelections.doctor?.surgicalDiscipline==='toxicology')&&(e[4]!=='relay-move'||summary.pathSelections.shipwright?.pathDiscipline==='mobile')&&(!e[4].startsWith('plague-')||summary.pathSelections.doctor?.pathDiscipline===e[4].slice(7))).map(([key,name,action,costs,handler])=>({
      id:f.id+'#'+key,featureId:f.id,key,name,action,costs:costs.map(([poolId,amount])=>({poolId,amount})),handler,
      description:f.description,completionRules:f.completionRules,source:f.source,preview:preview(handler,summary)??null,
    }));
  });
}
function spend(state,pool,amount){if(!Number.isSafeInteger(amount)||amount<1||(state.pools[pool]??0)<amount)fail('Insufficient resource: '+pool);state.pools[pool]-=amount;}
function dice(count,sides){return Array.from({length:count},()=>randomInt(1,sides+1));}
function rollAbility(option,result){
  const {count,sides,bonus,maximum}=option.preview.roll;
  result.rolls=maximum?Array(count).fill(sides):dice(count,sides);
  return result.rolls.reduce((total,value)=>total+value,bonus);
}
function availableKit(character,charges){
  return character.inventory.find(i=>i.definitionId==='healer-kit'&&i.quantity>0&&i.chargesCurrent>=charges);
}
function kit(character,charges){
  const item=availableKit(character,charges);
  if(!item)fail('Healer kit requires '+charges+' available charges');
  item.chargesCurrent-=charges;
}
function activate(character,summary,p,context={}){
  if(Object.keys(p).some(k=>!['optionId','targetIds','parameters','note','turnId'].includes(k)))fail('Invalid ability fields');
  const option=list(summary).find(o=>o.id===p.optionId);if(!option)fail('Ability option is unavailable');
  if(['Action','Bonus Action','Reaction','Magic action','Attack action rider'].includes(option.action)&&require('./vitality').incapacitated(character.rulesRuntime))fail('Incapacitated creatures cannot take this action');
  if(typeof(p.note??'')!=='string'||(p.note??'').length>500)fail('Invalid ability note');
  if(!Array.isArray(p.targetIds??[])||(p.targetIds??[]).length>30||(p.targetIds??[]).some(id=>typeof id!=='string'||id.length>100))fail('Invalid target IDs');
  const targets=p.targetIds??[],self=String(character._id??'self');
  if(new Set(targets).size!==targets.length||targets.some(id=>!id.trim()))fail('Choose distinct stable targets');
  // These options heal one creature. Personal recovery cannot be redirected to allies.
  if(['second-wind','spark-heal','lay-heal','triage','triage-antidote','impossible-operation'].includes(option.handler)&&targets.length>1)fail('This option requires one target');
  if(option.handler==='second-wind'&&targets.some(id=>id!==self))fail('Second Wind only heals its owner');
  if(option.handler==='spark-heal'&&(!targets.length||targets[0]===self))fail('Divine Spark requires another creature');
  if(option.handler==='impossible-operation'&&targets.length!==1)fail('Impossible Operation requires one target');
  const state=structuredClone(character.rulesRuntime),inventory=structuredClone(character.inventory);
  if(['path:thunderhide:walking-storm:14','path:chainbreaker:none-shall-kneel:14','path:reef-colossus:deckshaker:10'].includes(option.featureId)&&!state.effects.some(e=>e.featureId==='calling:reaver:rage:1'))fail('This ability requires active Rage');
  const c={...character,inventory,rulesRuntime:state},params=p.parameters??{};
  if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(k=>!['conditionSource','magical','undead','indices','attackTotal','saveAttribute','originalRoll','damageType','sear','amount','incomingDamage','targetRestEpoch','confirmed','mode','targetId','bodyIntact','deathSeconds','consent','objectId','replaceObjectId','distanceFeet','withinTenFeet','passers','widthFeet','heightFeet','bend','areas','exemptTargets','advantageTargets','objectTargets','radiusFeet','eventId','checkTotal','dc','extraAction','ammunitionId','conditions','allocations','roundNumber','vehicleLengthFeet','objectMissingHealth','salvageMinutes'].includes(k)))fail('Invalid ability parameters');
  const feature=summary.features.find(f=>f.id===option.featureId),level=summary.callingLevels[feature.ownerType==='calling'?feature.ownerId:require('./rules').paths.find(path=>path.id===feature.ownerId).callingId];
  const effect={id:randomInt(1,2147483647).toString(16),featureId:feature.id,optionId:option.id,name:option.name,note:p.note??'',targetIds:p.targetIds??[],createdAt:require('./clock').now(state),createdTurn:state.ownerTurn?.number??0};
  const result={type:'ability.activate',optionId:option.id,description:feature.description};
  for(const cost of option.costs)spend(state,cost.poolId,cost.amount);
  const temp=amount=>{if(amount>state.temporaryHealth){state.temporaryHealth=Math.max(0,amount);state.temporaryHealthMetadata={source:feature.id};}result.temporaryHealth=amount;};
  const heal=amount=>{if(targets.length>1)fail('Healing requires exactly one creature');result.healing=Math.max(0,amount);if(!targets.length||targets.includes(self))require('./vitality').heal(state,result.healing);};
  switch(option.handler){
    case 'rider-inoculate':case 'rider-mark-secondary':case 'rider-mark':case 'rider-mark-transfer':case 'rider-radiant':case 'rider-divine':case 'rider-potent':case 'rider-vitality':case 'rider-affinity':case 'rider-cantrip-half':case 'rider-evocation':
      require('./damageRiders').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'corsair-dash':case 'corsair-disengage':case 'corsair-hide':case 'corsair-aim':case 'corsair-aim-attack':case 'corsair-finesse':case 'gray-defense':case 'broker-resist':
      require('./utilityOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'suppressor-hit':case 'suppressor-crossing':case 'suppressor-hold':case 'outrider-recoil':case 'outrider-passing':case 'outrider-break':case 'outrider-horizon':
      require('./gunslingerOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'echo-link':case 'echo-save':case 'echo-pattern':case 'echo-share':case 'echo-unwritten':case 'tempest-pulse':case 'tempest-convert':case 'tempest-damage':case 'tempest-live':
      require('./casterPathOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'starwake-guide':case 'starwake-hit':case 'starwake-home':case 'mangrove-hit':case 'mangrove-predator':case 'mangrove-vanish':
      require('./navigatorOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'stormhide-leap':case 'stormhide-retaliate':case 'stormhide-walking':case 'stormhide-pulse':case 'reaver-path-hit':case 'chainbreaker-escape':case 'chainbreaker-rally':case 'chainbreaker-kneel':case 'colossus-stance':case 'colossus-suppress':case 'colossus-deck':
      require('./reaverOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'freeport-break':case 'freeport-reroll':case 'freeport-harbor':case 'vigil-watch':case 'vigil-hit':case 'vigil-cure':case 'vigil-dawn':case 'vigil-dawn-damage':
      require('./wardenOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'covenant-steel':case 'covenant-sentinel':case 'covenant-standard':case 'covenant-grant':
      require('./covenantOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'conduit-price':case 'conduit-sacrifice':case 'conduit-circuit':
      require('./conduitOperations').apply(c,summary,option,params,targets,effect,result,p.turnId,context);break;
    case 'envoy-move':case 'envoy-save':case 'envoy-parley':case 'envoy-all':
    case 'lantern-study':case 'lantern-detect':case 'lantern-search':case 'lantern-mark':case 'lantern-reroll':case 'duelist-parry':case 'duelist-answer':case 'duelist-footwork':case 'duelist-perfect':
      require('./corsairOperations').apply(c,summary,option,params,targets,effect,result,p.turnId);break;
    case 'burden':{
      if(option.handler==='burden'){if(params.confirmed!==true||targets.length!==1||targets.includes(self)||!Number.isSafeInteger(params.incomingDamage)||params.incomingDamage<1||params.incomingDamage>1000000)fail('Confirm one ally in your active aura and its post-mitigation incoming damage');result.transferredDamage=Math.floor(params.incomingDamage/2);result.allyDamage=params.incomingDamage-result.transferredDamage;result.damageOutcome=require('./vitality').damage(c,summary,{amount:result.transferredDamage,damageType:'force',confirmed:true},{ignoreMitigation:true});}
      result.recordOnly=true;break;
    }
    case 'uncanny-dodge':{
      if(params.confirmed!==true||!Number.isSafeInteger(params.incomingDamage)||params.incomingDamage<1||params.incomingDamage>1000000)fail('Confirm a visible attacker hit and its damage before Resistance');
      result.remainingDamage=Math.floor(params.incomingDamage/2);result.damageReduction=params.incomingDamage-result.remainingDamage;result.recordOnly=true;break;
    }
    case 'indomitable':case 'stroke-luck':{
      if(params.confirmed!==true||typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100||!Number.isSafeInteger(params.checkTotal)||!Number.isSafeInteger(params.dc)||params.dc<1||params.dc>1000||params.checkTotal>=params.dc)fail('Confirm a failed D20 Test, its original total, DC and stable event ID');
      state.counters.rerolledTests??=[];if(state.counters.rerolledTests.includes(params.eventId))fail('This failed test has already been resolved');
      if(state.counters.rerolledTests.length>=200)fail('Too many resolved tests; complete a rest');
      if(option.handler==='indomitable'){
        if(!Object.hasOwn(summary.savingThrowModifiers,params.saveAttribute))fail('Choose the failed saving throw attribute');
        result.rolls=dice(1,20);result.checkTotal=result.rolls[0]+summary.savingThrowModifiers[params.saveAttribute]+level;result.levelBonus=level;
      }else{
        if(!Number.isSafeInteger(params.originalRoll)||params.originalRoll<1||params.originalRoll>20)fail('Record the original d20 for Stroke of Luck');
        result.naturalRoll=20;result.checkTotal=params.checkTotal+20-params.originalRoll;
      }
      state.counters.rerolledTests.push(params.eventId);result.success=result.checkTotal>=params.dc;result.mustUseNewRoll=true;result.recordOnly=true;break;
    }
    case 'spark-damage':case 'turn-undead':case 'abjure':{
      if(params.confirmed!==true||!targets.length)fail('Confirm eligible visible creatures and the stated range');
      if(!inventory.some(i=>i.definitionId&&require('../../equipment').definition(i.definitionId).focus==='holy')&&!(option.handler==='abjure'&&[character.loadout.mainHand,character.loadout.offHand].some(id=>inventory.find(i=>i.instanceId===id&&i.definitionId&&require('../../equipment').definition(i.definitionId).kind==='weapon'))))fail('Present a Holy Symbol or, for Abjure Foes, a held weapon');
      result.save={...option.preview.save};result.rangeFeet=option.handler==='abjure'?60:30;
      if(option.handler==='spark-damage'){
        if(targets.length!==1||targets[0]===self||!['radiant','necrotic'].includes(params.damageType))fail('Divine Spark requires one other creature and Radiant or Necrotic damage');
        result.damage=Math.max(0,rollAbility(option,result));result.damageType=params.damageType;result.save.successDamage=Math.floor(result.damage/2);result.recordOnly=true;
      }else{
        if(option.handler==='abjure'&&targets.length>Math.max(1,summary.attributeModifiers.spirit))fail('Abjure Foes target limit exceeded');
        effect.expiresAt=effect.createdAt+60000;effect.targetConditions=option.handler==='abjure'?['frightened']:['frightened','incapacitated'];effect.endsOnTargetDamage=true;
        if(option.handler==='turn-undead'){
          effect.fleeCaster=true;effect.endsOnCasterIncapacitated=true;
          if(params.sear!==undefined&&typeof params.sear!=='boolean')fail('Choose whether to apply Sear Undead');
          if(params.sear){if(level<5)fail('Sear Undead requires Doctor five');result.damage=rollAbility(option,result);result.damageType='radiant';result.searDoesNotEndTurning=true;}
        }else effect.targetTurnRestriction='Choose only movement, one Action or one Bonus Action';
      }
      break;
    }
    case 'keeper-stabilize':case 'keeper-heal':case 'keeper-dawn':{
      if(params.confirmed!==true||targets.length!==1||targets[0]===self)fail('Confirm one other creature and the stated zero-Health or failed-death-save trigger');
      if(option.handler==='keeper-stabilize'){
        result.stabilize=true;result.requireZeroHealth=true;
        if(summary.pathSelections.doctor.pathDiscipline==='comfort')result.temporaryHealthGrant={amount:Math.max(1,summary.attributeModifiers.instinct),targetIds:targets};
        else result.permitsLastSentence=true;
      }else if(option.handler==='keeper-heal'){result.healing=2*level;result.requireZeroHealth=true;}
      else{result.restoresHealthTo=1;result.restoreFromFailedSaves=true;}
      result.rangeFeet=30;result.recordOnly=true;break;
    }
    case 'plague-antidote':case 'plague-quarantine':{
      if(params.confirmed!==true||targets.length<1||targets.length>(option.handler==='plague-antidote'?2:1))fail('Confirm eligible targets within 30 feet');
      if(option.handler==='plague-antidote'){result.endsCondition='poisoned';result.recordOnly=true;}
      else{effect.expiresAt=effect.createdAt+60000;effect.speedMultiplier=0.5;effect.reactionsDisabled=true;effect.repeatSave='end-of-target-turn';result.save={...option.preview.save};}
      break;
    }
    case 'clean-bill':if(params.confirmed!==true||targets.length>1)fail('Confirm one creature within reach');kit(c,option.preview.kitCharges);heal(rollAbility(option,result));result.endsConditions=['poisoned','blinded','deafened'];result.recordOnly=true;break;
    case 'lay-poison':if(targets.length>1)fail('Choose one creature to cure Poisoned');result.endsCondition='poisoned';result.recordOnly=true;break;
    case 'measured-charge':case 'grand-battery':Object.assign(result,require('./cinderOperations').activate(c,summary,option,params,targets,effect));break;
    case 'relay-place':{
      if(params.confirmed!==true)fail('Confirm unoccupied relay placement within 30 feet');
      const relays=state.effects.filter(e=>e.objectType==='relay'&&e.health.current>0&&e.expiresAt>require('./clock').now(state));
      const cap=level>=14?2:1;
      if(relays.length>=cap){
        const replaced=cap===1?relays[0]:relays.find(e=>e.id===params.replaceObjectId);
        if(!replaced)fail('Choose which relay to dismiss');
        state.effects=state.effects.filter(e=>e.id!==replaced.id);
      }else if(params.replaceObjectId!==undefined)fail('No relay needs replacement');
      effect.objectType='relay';effect.objectId=effect.id;effect.guard=15;effect.health={current:2*level,max:2*level};
      effect.immunities=['poison','psychic'];effect.mobile=summary.pathSelections.shipwright.pathDiscipline==='mobile';
      effect.sizeFeet=1;effect.expiresAt=effect.createdAt+60000;effect.withinTenFeet=false;break;
    }
    case 'relay-move':case 'relay-proximity':case 'relay-discharge':{
      const relay=state.effects.find(e=>e.objectType==='relay'&&e.id===params.objectId&&e.health.current>0&&e.expiresAt>require('./clock').now(state));
      if(!relay)fail('Choose a live owned relay');
      if(option.handler==='relay-move'){
        if(!relay.mobile||params.confirmed!==true||!Number.isSafeInteger(params.distanceFeet)||params.distanceFeet<0||params.distanceFeet>15)fail('Mobile relay movement is at most 15 feet, staying within 60 feet of you');
        relay.withinTenFeet=false;relay.lastMovementFeet=params.distanceFeet;
      }else if(option.handler==='relay-proximity'){
        if(typeof params.withinTenFeet!=='boolean')fail('Record whether you are within ten feet of this relay');
        relay.withinTenFeet=params.withinTenFeet;
      }else{
        if(params.confirmed!==true)fail('Confirm all creatures within ten feet are included, without exempting allies');
        result.damage=rollAbility(option,result);result.damageType='lightning';
        result.save={...option.preview.save,success:'half',successDamage:Math.floor(result.damage/2)};result.radiusFeet=10;
        result.discharge={relayId:relay.id,targetIds:[...targets]};
        state.effects=state.effects.filter(e=>e.id!==relay.id);
      }
      // Movement/proximity are changes to the existing object, not new persistent effects.
      result.recordOnly=true;break;
    }
    case 'tactical-mind':{
      if(params.confirmed!==true||typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100||!Number.isSafeInteger(params.checkTotal)||params.checkTotal < -100||params.checkTotal>1000||!Number.isSafeInteger(params.dc)||params.dc<1||params.dc>1000||params.checkTotal>=params.dc)fail('Record one GM-confirmed failed ability check, its total and DC');
      state.counters.tacticalMindChecks??=[];if(state.counters.tacticalMindChecks.includes(params.eventId))fail('Tactical Mind already resolved this check');
      result.checkTotal=params.checkTotal+rollAbility(option,result);result.success=result.checkTotal>=params.dc;
      if(!result.success)state.pools['gunslinger:second-wind']++;
      state.counters.tacticalMindChecks.push(params.eventId);result.refunded=!result.success;result.recordOnly=true;break;
    }
    case 'action-surge':{
      const ownerTurn=state.ownerTurn?.open?state.ownerTurn.id:null;
      const turnId=ownerTurn??(typeof p.turnId==='string'?p.turnId.trim():null);
      if(state.inCombat&&!ownerTurn||ownerTurn&&p.turnId!==undefined&&p.turnId!==ownerTurn)fail('Action Surge requires your current recorded owner turn');
      if(params.confirmed!==true||!require('./castingTurn').validLabel(turnId)||!['attack','dash','disengage','dodge','help','hide','influence','ready','search','study','utilize'].includes(params.extraAction))fail('Choose a non-Magic action and confirm it is your turn');
      state.counters.actionSurgeTurns??=[];if(state.counters.actionSurgeTurns.includes(turnId))fail('Action Surge is limited to once on a turn');
      state.counters.actionSurgeTurns.push(turnId);result.additionalAction=params.extraAction;result.recordOnly=true;break;
    }
    case 'second-wind':{
      heal(rollAbility(option,result));
      if(level>=5){
        const speed=summary.movement.walk;
        result.tacticalShift={maximumFeet:Math.floor(Math.max(0,speed)/2),provokesOpportunityAttacks:false};
      }break;
    }
    case 'tireless':temp(rollAbility(option,result));break;
    case 'spark-heal':heal(rollAbility(option,result));break;
    case 'lay-heal':spend(state,'warden:lay-on-hands',params.amount);heal(params.amount);break;
    case 'warden-touch':{
      const chosen=params.conditions;if(targets.length!==1||!Array.isArray(chosen)||!chosen.length||new Set(chosen).size!==chosen.length||chosen.some(id=>!['blinded','charmed','deafened','frightened','paralyzed','stunned'].includes(id))||params.confirmed!==true)fail('Choose one touched creature and distinct eligible conditions');spend(state,'warden:lay-on-hands',5*chosen.length);result.endsConditions=chosen;result.recordOnly=true;break;
    }
    case 'rage':{
      const armor=character.inventory.find(i=>i.instanceId===character.loadout.armor);
      if(armor&&require('../../equipment').definition(armor.definitionId).category==='heavy')fail('Heavy armor prevents Rage');
      state.effects=state.effects.filter(e=>!e.concentration&&!e.rage&&!e.walkingStorm);state.concentrationChecks=[];effect.expiresAt=effect.createdAt+600000;effect.rage=true;if(summary.paths.reaver==='bloodwake'&&level>=6)state.conditions=state.conditions.filter(c=>!['charmed','frightened'].includes(c.conditionId));if(level>=7)result.instinctivePounce={maximumFeet:Math.floor(summary.movement.walk/2),provokesOpportunityAttacks:true};if(level<15)effect.ends='end-of-next-turn';break;
    }
    case 'innate':effect.expiresAt=effect.createdAt+60000;break;
    case 'veil':effect.ends='end-of-next-turn';effect.condition='invisible';break;
    case 'wings':effect.expiresAt=effect.createdAt+3600000;effect.flySpeed=60;break;
    case 'sense':effect.expiresAt=effect.createdAt+600000;break;
    case 'sacred':{
      const attack=require('../../equipment').derive(c).attacks.find(a=>a.instanceId===params.objectId&&a.weapon.type==='melee'&&!a.requiresTwoHandGrip);if(params.confirmed!==true||targets.length||!attack)fail('Confirm taking the Attack action with one held Melee weapon');state.effects=state.effects.filter(e=>!e.sacredWeaponId);effect.sacredWeaponId=params.objectId;effect.expiresAt=effect.createdAt+600000;effect.brightFeet=20;effect.dimBeyondFeet=20;result.sacredWeaponAttackBonus=Math.max(1,summary.attributeModifiers.spirit);break;
    }
    case 'nimbus':
      if(params.confirmed!==true||targets.length)fail('Confirm activating Holy Nimbus on your own Aura of Protection');state.effects=state.effects.filter(e=>!e.holyNimbus);effect.holyNimbus=true;effect.expiresAt=effect.createdAt+600000;break;
    case 'nimbus-pulse':{
      if(params.confirmed!==true||targets.length!==1||targets.includes(self)||!state.effects.some(e=>e.holyNimbus)||!summary.auraOfProtection||require('./vitality').incapacitated(state)||typeof p.turnId!=='string'||!p.turnId.trim()||p.turnId.length>100)fail('Confirm one enemy starts its turn inside your conscious active Holy Nimbus aura');
      state.counters.nimbusPulses??=[];const key=targets[0]+':'+p.turnId;if(state.counters.nimbusPulses.includes(key)||state.counters.nimbusPulses.length>=200)fail('Holy Nimbus already resolved this enemy turn or its journal is full');state.counters.nimbusPulses.push(key);result.damage=summary.attributeModifiers.spirit+summary.trainingBonus;result.damageType='radiant';result.recordOnly=true;break;
    }
    case 'presence':
      if(params.confirmed!==true||!targets.length)fail('Confirm chosen visible creatures in your thirty-foot Emanation');effect.expiresAt=effect.createdAt+60000;effect.targetCondition='frightened';effect.repeatSave='end-of-target-turn';result.save={...option.preview.save};effect.save=result.save;effect.radiusFeet=30;break;
    case 'bloodwake-retaliation':{
      if(params.confirmed!==true||targets.length!==1||typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100)fail('Confirm damage taken from this one creature within five feet and a stable trigger ID');
      const attack=params.mode==='unarmed'?null:require('../../equipment').derive(c).attacks.find(a=>a.instanceId===params.objectId&&!a.requiresTwoHandGrip&&a.weapon.type==='melee');if(params.mode!=='unarmed'&&!attack)fail('Choose an equipped melee weapon or Unarmed Strike');
      state.counters.bloodwakeRetaliation??=[];if(state.counters.bloodwakeRetaliation.includes(params.eventId)||state.counters.bloodwakeRetaliation.length>=200)fail('Retaliation already resolved this damage trigger or journal is full');state.counters.bloodwakeRetaliation.push(params.eventId);result.grantedAttack={targetId:targets[0],weaponId:attack?.instanceId??null,unarmed:!attack,actionType:'reaction'};result.recordOnly=true;break;
    }
    case 'silent-keel':{
      if(params.confirmed!==true||!['vehicle','creatures'].includes(params.mode)||targets.length<1||targets.length>(params.mode==='vehicle'?1:6))fail('Confirm one vehicle or up to six willing creatures within 30 feet');
      if(params.mode==='creatures'){
        effect.targetIds=targets.map(id=>id==='self'?self:id);
        if(new Set(effect.targetIds).size!==effect.targetIds.length)fail('Choose distinct Silent Keel creatures');
      }else{
        if(!Number.isFinite(params.vehicleLengthFeet)||params.vehicleLengthFeet<=0||params.vehicleLengthFeet>100)fail('Silent Keel covers a vehicle up to 100 feet long');
        effect.vehicleLengthFeet=params.vehicleLengthFeet;
      }
      effect.concentration=true;
      effect.expiresAt=effect.createdAt+600000;
      effect.mode=params.mode;
      break;
    }
    case 'unseen-passage':effect.expiresAt=effect.createdAt+60000;break;
    case 'unseen-consequence':{
      if(params.confirmed!==true||typeof p.turnId!=='string'||!p.turnId.trim()||p.turnId.length>100||!state.effects.some(e=>e.featureId===feature.id&&e.optionId.endsWith('#main')&&e.expiresAt>require('./clock').now(state)))fail('Confirm ending this turn inside a structure during Unseen Passage');
      state.counters.unseenTurns??=[];if(state.counters.unseenTurns.includes(p.turnId))fail('This turn consequence was already applied');
        state.counters.unseenTurns.push(p.turnId);result.damage=rollAbility(option,result);
      result.damageOutcome=require('./vitality').damage(c,summary,{amount:result.damage,damageType:'force',confirmed:true});result.damage=result.damageOutcome.damage;
      result.damageType='force';result.movement='nearest empty space';result.recordOnly=true;break;
    }
    case 'squall':{
      const exempt=params.exemptTargets??[];if(params.confirmed!==true||targets.length||!Array.isArray(exempt)||new Set(exempt).size!==exempt.length||exempt.length>(level>=7?Math.max(1,summary.attributeModifiers.instinct):0)||exempt.some(id=>typeof id!=='string'||!id.trim()||id.length>100))fail('Confirm a Squall center within sixty feet and distinct visible exemptions within Borrowed Squall\'s limit');
      effect.radius=level>=15?20:level>=7?15:10;effect.zone=option.key;effect.exemptTargets=exempt;effect.ends=level>=11?'end-of-next-turn':'start-of-next-turn';effect.heavilyObscured=option.key==='fog';effect.rangedWeaponAttacksThroughDisadvantage=option.key==='crosswind';effect.difficultTerrain=option.key==='surge';break;
    }
    case 'broker-credit':{
      const squall=state.effects.find(e=>e.id===params.objectId&&e.featureId==='path:storm-broker:barometer-instinct:3');if(params.confirmed!==true||!squall||targets.length!==1||targets.includes(self)||state.ownerTurn?.open||!state.inCombat||!state.initiative?.combatId||!Number.isSafeInteger(params.roundNumber)||params.roundNumber<1||params.roundNumber>100000||typeof p.turnId!=='string'||!p.turnId.trim()||p.turnId.length>100||typeof params.eventId!=='string'||!params.eventId.trim()||params.eventId.length>100)fail('Confirm a combat round and one visible ally within sixty feet succeeded inside your active Squall outside your turn');
      state.counters.brokerCredits??=[];const combatId=state.initiative.combatId,key=combatId+':'+params.roundNumber,history=state.counters.brokerCredits;if(history.some(r=>r.key===key||r.eventId===params.eventId)||history.length>=200||history.some(r=>r.combatId===combatId&&r.roundNumber>params.roundNumber))fail('Captain\'s Credit already granted this round, success already used, round moved backward or journal is full');history.push({key,eventId:params.eventId,combatId,roundNumber:params.roundNumber});result.temporaryHealthGrant={amount:Math.max(1,summary.trainingBonus+summary.attributeModifiers.instinct),targetIds:targets,metadata:{source:option.featureId,sourceCharacterId:self}};result.creditRound=params.roundNumber;result.recordOnly=true;break;
    }
    case 'triage':case 'triage-antidote':{
      if(params.confirmed!==true)fail('Confirm you can see and touch the Triage recipient within 5 feet');
      const target=p.targetIds?.[0];if(!target||p.targetIds.length!==1||typeof params.targetRestEpoch!=='string'||!params.targetRestEpoch.trim())fail('Triage requires one stable target and its rest epoch');
      state.targetLocks??={};const key=target+':'+params.targetRestEpoch;if(state.targetLocks[key])fail('Target already received Triage since its last rest');
      kit(c,option.preview.kitCharges);state.targetLocks[key]=option.id;
      if(option.handler==='triage'){
        heal(rollAbility(option,result));
        if(level>=6&&summary.pathSelections.doctor.surgicalDiscipline==='trauma')result.endsCondition='prone';
      }else{
        result.endsCondition='poisoned';
        result.saveAdvantageEffect={
          id:require('node:crypto').randomUUID(),featureId:feature.id,name:'Toxicology: Advantage on saves against Poisoned',
          poisonedSaveAdvantage:true,createdAt:effect.createdAt,expiresAt:effect.createdAt+60000,
        };
      }
      break;
    }
    case 'impossible-operation':if(targets.includes(self)||params.bodyIntact!==true||params.consent!==true||!Number.isInteger(params.deathSeconds)||params.deathSeconds<0||params.deathSeconds>60)fail('Confirm another consenting, intact body dead within one minute');kit(c,option.preview.kitCharges);result.restoresHealthTo=1;break;
    case 'salvage':{
      if(params.confirmed!==true||typeof params.objectId!=='string'||!params.objectId.trim()||params.objectId.length>100)fail('Confirm a salvageable wreck with its stable ID');
      if(!Number.isSafeInteger(params.salvageMinutes)||params.salvageMinutes<10)fail('Confirm at least ten completed minutes of salvage');
      state.salvageCp=(state.salvageCp??0)+1000*level;
      result.salvageCp=1000*level;
      effect.wreckId=params.objectId;
      effect.salvageMinutes=params.salvageMinutes;
      break;
    }
    case 'ghost-repair':case 'ghost-sabotage':{
      if(params.confirmed!==true||typeof params.objectId!=='string'||!params.objectId.trim()||params.objectId.length>100)fail('Confirm a nonmagical object touched, identified by stable ID');
      const repairing=option.handler==='ghost-repair';
      const tool=repairing?'carpenter-tools':'thieves-tools';
      if(!c.inventory.some(item=>item.definitionId===tool&&item.quantity>0))fail(repairing?'Ghost Patch requires carried carpenter\'s tools':'Concealing tampering requires carried thieves\' tools');
      effect.objectId=params.objectId;
      if(repairing){
        if(!Number.isSafeInteger(params.objectMissingHealth)||params.objectMissingHealth<1)fail('Record the object\'s missing Health');
        result.objectHealing=Math.min(params.objectMissingHealth,rollAbility(option,result));
        effect.objectHealing=result.objectHealing;
      }else effect.discoveryDC=summary.spellcasting.shipwright.saveDC;
      break;
    }
    case 'barrier':case 'barrier-hour':{
      if(params.confirmed!==true)fail('Confirm unoccupied barrier placement within 30 feet without trapping creatures');
      const passers=params.passers??[];
      if(!Array.isArray(passers)||new Set(passers).size!==passers.length||passers.some(id=>typeof id!=='string'||!id.trim()||id.length>100)||passers.length>(level>=10?summary.trainingBonus:0))fail('Barrier passers exceed Harbor Geometry limit');
      effect.objectId=params.objectId??effect.id;effect.width=level>=10?20:10;effect.height=level>=10?10:5;
      for(const[key,field]of [['widthFeet','width'],['heightFeet','height']])if(params[key]!==undefined){if(!Number.isSafeInteger(params[key])||params[key]<1||params[key]>effect[field])fail('Invalid barrier dimensions');effect[field]=params[key];}
      if(params.bend!==undefined&&(typeof params.bend!=='boolean'||params.bend&&level<10))fail('Barrier bend requires Harbor Geometry');
      effect.passers=passers;effect.bend=params.bend??false;effect.thickness=1;effect.immunities=['poison','psychic'];
      effect.resistance=level>=14?'all-except-force-and-siege':null;
      effect.guard=15+(summary.pathSelections.shipwright.fortification==='bulwark'?Math.max(1,summary.attributeModifiers.wit):0);
      effect.health={current:(level>=14?10:level>=6?7:5)*level,max:(level>=14?10:level>=6?7:5)*level};
      effect.cover=level>=10?'three-quarters':'half';effect.expiresAt=effect.createdAt+(option.handler==='barrier-hour'?3600000:60000);
      if(summary.pathSelections.shipwright.fortification==='shelter'&&targets.length){
        result.temporaryHealthGrant={amount:summary.trainingBonus,targetIds:targets};
        if(targets.includes(self))temp(summary.trainingBonus);
      }
      state.effects=state.effects.filter(e=>e.objectType!=='barrier');effect.objectType='barrier';break;
    }
    case 'barrier-reduce':if(params.confirmed!==true||targets.length!==1||!state.effects.some(e=>e.objectType==='barrier'&&e.expiresAt>require('./clock').now(state)&&e.health.current>0))fail('Confirm one damaged creature within five feet of your live barrier');result.damageReduction=Math.max(1,rollAbility(option,result));break;
    case 'preserve-life':{
      const allocations=params.allocations;if(params.confirmed!==true||!targets.length||!Array.isArray(allocations)||allocations.length!==targets.length||allocations.some((a,i)=>!a||Object.keys(a).some(k=>!['targetId','amount'].includes(k))||a.targetId!==targets[i]||!Number.isSafeInteger(a.amount)||a.amount<1)||allocations.reduce((n,a)=>n+a.amount,0)>5*level)fail('Allocate positive healing to distinct Bloodied creatures within thirty feet, up to five times Doctor level');
      if(!c.inventory.some(i=>i.definitionId&&require('../../equipment').definition(i.definitionId).focus==='holy'))fail('Preserve Life requires presenting a carried Holy Symbol');
      result.healingAllocations=allocations;result.healingBudget=allocations.reduce((n,a)=>n+a.amount,0);result.healingCapFraction=0.5;result.requireBloodied=true;result.recordOnly=true;
      const personal=allocations.find(a=>a.targetId===self);if(personal)require('./vitality').targetEffects(state,{...result,healing:personal.amount});break;
    }
    default:fail('Ability handler is not implemented');
  }
  if(effect.concentration)state.effects=state.effects.filter(e=>!e.concentration);
  if((result.saveAdvantageEffect||result.endsCondition||result.endsConditions||result.stabilize||result.restoresHealthTo!==undefined)&&(!targets.length||targets.includes(self)))require('./vitality').targetEffects(state,{...result,healing:0});
  if(option.handler==='squall')state.effects=state.effects.filter(e=>e.featureId!==feature.id);
  if(!result.recordOnly)state.effects.push(effect);if(state.effects.length>200)fail('Too many active effects; end expired effects first');
  state.revision++;
  require('./runtime').validateProjected(summary,state);
  character.rulesRuntime=state;character.inventory=c.inventory;
  return {...result,effect};
}
module.exports={list,activate,availableKit};
