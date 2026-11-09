// Original Archipelago designs, authorized 2026-11-06. No additional SRD subclasses.
// All distances are feet. Scene effects are adjudicated by the GM; costs are persisted.
const source = { document: 'Sanguine Archipelago: Thirty-Two Paths', version: '2026-11-07' };
const designs = [
  { id: 'black-flag-envoy', name: 'Black Flag Envoy', callingId: 'corsair', identity: 'Free Captain negotiator and battlefield coordinator.', choice: ['parley', 'intimidation'], skill: 'persuasion',
    features: [
      [3, 'Terms of Surrender', 'Choose parley or intimidation. Gain Training in Persuade (parley) or Threaten (intimidation), or Expertise if already Trained. As a Bonus Action spend one Envoy use: an ally within 30 feet who hears you may use its Reaction to move half its Speed without provoking Opportunity Attacks. You cannot target yourself.', 'envoy', 1],
      [9, 'Crew Before Crown', 'Your Envoy action may instead let the ally repeat a saving throw against Charmed or Frightened, with advantage. On success that condition ends. Range becomes 60 feet.', 'envoy', 1],
      [13, 'Binding Parley', 'Once per Long Rest, as an Action address up to your Spirit modifier (minimum one) creatures within 60 feet that understand you. Each makes an Instinct save (DC 8 + Training Bonus + Spirit). On failure it cannot attack you for one minute unless you or your allies harm it. This is Charmed; repeat the save at the end of each turn.', 'parley', 1],
      [17, 'All Hands', 'As a Bonus Action spend two Envoy uses to apply Terms of Surrender to up to three different allies. Each still spends its own Reaction; a creature cannot benefit twice from the same command.', 'envoy', 2],
    ], pools: { envoy: { max: 3, short: 1 }, parley: { max: 1, level: 13 } } },
  { id: 'hollow-lantern', name: 'Hollow Lantern', callingId: 'corsair', identity: 'Kirkian investigator who exposes illusions and stolen identities.', choice: ['investigator', 'watcher'],
    features: [
      [3, 'Read the Wake', 'Choose Investigate or Perception; gain Training, or Expertise if already Trained. As a Bonus Action spend one Lantern use to study one creature within 30 feet. Until the end of your next turn, you may Sneak Attack it without advantage if no other creature is within 5 feet of you, and you do not have disadvantage.', 'lantern', 1],
      [9, 'Unmask the False', 'As an Action spend one Lantern use to gain advantage for ten minutes on checks to detect disguises, shapechanging and illusions. This does not reveal an illusion automatically. You can Search as a Bonus Action without spending a use.', 'lantern', 1],
      [13, 'Lantern in the Fog', 'Gain Blindsight 10 feet. When a creature you can perceive within 30 feet becomes Invisible, you may use your Reaction and one Lantern use to mark its last location. Until your next turn it gains no advantage against you from being unseen; this does not reveal its later location.', 'lantern', 1],
      [17, 'The Last Tell', 'Once per Short or Long Rest when your Sneak Attack hits a creature studied by Read the Wake, reroll up to three Sneak Attack dice and use the new results. You decide after seeing the damage dice.', 'last-tell', 1],
    ], pools: { lantern: { max: 3, short: 1 }, 'last-tell': { max: 1, level: 17, short: 'all' } } },
  { id: 'saltglass-duelist', name: 'Saltglass Duelist', callingId: 'corsair', identity: 'Arannian duelist who trades concealment for single combat.', choice: ['rapier', 'cutlass'],
    features: [
      [3, 'Open Challenge', 'Choose rapier or cutlass as your signature weapon. When holding that weapon and no other weapon or Shield, you may Sneak Attack a target within 5 feet without advantage if no other creature is within 5 feet of you and you lack disadvantage. As a Reaction spend one Duel use to add your Training Bonus to Guard against one melee attack you can see, potentially causing it to miss.', 'duel', 1],
      [9, 'Saltglass Footwork', 'Your Speed increases by 5 feet. After making a melee attack against a creature, that creature cannot make Opportunity Attacks against you for the rest of the turn, whether you hit or miss. You must be holding your signature weapon.', null, 0],
      [13, 'Answer in Steel', 'When an attack misses you because of Open Challenge, you may make one melee attack against the attacker as part of the same Reaction. This attack cannot deal Sneak Attack damage.', null, 0],
      [17, 'Perfect Measure', 'Once per Long Rest when you miss with your signature weapon, turn that miss into a hit. It is not a Critical Hit. You must choose before damage is rolled.', 'perfect-measure', 1],
    ], speed: [[9, 5]], pools: { duel: { max: 3, short: 1 }, 'perfect-measure': { max: 1, level: 17 } } },
  { id: 'iron-suppressor', name: 'Iron Suppressor', callingId: 'gunslinger', identity: 'Yuma formation gunner who controls approaches.', choice: ['push', 'slow'],
    features: [
      [3, 'Suppressing Fire', 'Choose push or slow. Once per turn when a Ranged weapon attack hits, spend one Suppression use to deal 1d6 extra damage and force a Resolve save (DC 8 + Training Bonus + Agility). On failure push moves the target 10 feet directly away; slow reduces its Speed by 10 feet until your next turn. Does not stack with the same mastery effect.', 'suppression', 1],
      [7, 'Entrenched Drill', 'If you have moved no more than 5 feet on your turn, you have Half Cover against ranged attacks until your next turn. Moving farther ends this benefit. Suppression extra damage becomes 1d8.', null, 0],
      [10, 'Crossing Denied', 'As a Reaction when a creature you can see moves into a space within 30 feet, spend one Suppression use to make one Ranged weapon attack against it. The attack does not also apply Suppressing Fire.', 'suppression', 1],
      [15, 'Overlapping Fields', 'Your Suppressing Fire can affect a second creature within 10 feet of the original target. It makes the same save and suffers the chosen control effect on failure, but takes no damage. Suppression extra damage becomes 1d10.', null, 0],
      [18, 'Hold the Corridor', 'Once per Long Rest, as a Bonus Action recover all expended Suppression uses. Until your next turn your Suppressing Fire save DC increases by 2.', 'hold-corridor', 1],
    ], pools: { suppression: { max: 4, short: 'all' }, 'hold-corridor': { max: 1, level: 18 } } },
  { id: 'brass-outrider', name: 'Brass Outrider', callingId: 'gunslinger', identity: 'Akshan frontier courier and mobile skirmisher.', choice: ['runner', 'rider'],
    features: [
      [3, 'Ride the Recoil', 'Choose runner or rider. Runner gains Athletics Training; rider gains Animal Handling Training (Expertise if already Trained). Once per turn after a Ranged weapon attack, spend one Outrider use to move up to 15 feet without provoking Opportunity Attacks. A willing mount can move instead, using its movement.', 'outrider', 1],
      [7, 'Dust and Distance', 'Your Speed increases by 10 feet when not wearing Heavy armor. Mounting or dismounting costs only 5 feet of movement. Difficult Terrain caused by rubble or sand costs you no extra movement.', null, 0],
      [10, 'Passing Shot', 'After moving at least 20 feet on your turn, your first weapon hit that turn deals 1d8 extra damage. This applies only once per turn and cannot be combined with Ride the Recoil movement before the hit.', null, 0],
      [15, 'Break Pursuit', 'When a creature ends its turn within 5 feet of you, you may use your Reaction and one Outrider use to move half your Speed without provoking Opportunity Attacks.', 'outrider', 1],
      [18, 'Over the Horizon', 'Once per Short or Long Rest as a Bonus Action, move up to your Speed and make one weapon attack. Passing Shot applies normally; this action does not grant an additional Action.', 'horizon', 1],
    ], speed: [[7, 10]], pools: { outrider: { max: 3, short: 'all' }, horizon: { max: 1, level: 18, short: 'all' } } },
  { id: 'cinder-artillerist', name: 'Cinder Artillerist', callingId: 'gunslinger', identity: 'Klechi siege specialist using controlled powder charges.', choice: ['smoke', 'breach'],
    features: [
      [3, 'Measured Charge', 'Choose smoke or breach. As an Action spend one Charge use to place a charge within 30 feet. It detonates immediately: creatures in a 5-foot radius make an Agility save (DC 8 + Training Bonus + Wit), taking 2d6 Fire damage on failure or half on success. Smoke leaves a heavily obscured 5-foot radius until your next turn; breach deals double damage to unattended objects. This is not a weapon attack.', 'charge', 1],
      [7, 'Safe Handling', 'Gain Training with smith tools and advantage on checks to inspect explosives. You and allies you choose have advantage on saves against your charges. Charge damage becomes 3d6.', null, 0],
      [10, 'Shaped Detonation', 'Charge radius can be 10 feet. Choose up to your Wit modifier (minimum one) creatures in the area; they take no damage and suffer no charge effect. Charges do not bypass total cover.', null, 0],
      [15, 'Controlled Demolition', 'Charge damage becomes 5d6. Breach charges ignore object Resistance to Fire. Smoke radius becomes 10 feet and lasts one minute unless a strong wind disperses it.', null, 0],
      [18, 'Grand Battery', 'Once per Long Rest as an Action spend two Charge uses to detonate two charges at different points within 60 feet. A creature in both areas is affected only once. Each charge deals 6d6 Fire damage.', 'charge', 2, 'battery'],
    ], pools: { charge: { max: 3, short: 'all' }, battery: { max: 1, level: 18 } } },
  { id: 'starwake-pilot', name: 'Starwake Pilot', callingId: 'navigator', identity: 'Thult wayfinder who guides allies through hostile terrain.', choice: ['cliff', 'current'],
    features: [
      [3, 'Chart the Passage', 'Choose cliff or current. Gain Training with navigator tools. As a Bonus Action spend one Passage use to guide up to two allies within 30 feet for one minute. Cliff gives a Climb Speed of 20 feet; current gives a Swim Speed of 20 feet. This requires Concentration as a spell and grants no extra movement.', 'passage', 1],
      [7, 'Safe Bearing', 'You have advantage on saves against becoming lost or being teleported unwillingly. Guided allies ignore nonmagical Difficult Terrain and their granted speed becomes 30 feet.', null, 0],
      [11, 'Converging Routes', 'Once on each of your turns when a guided ally is within 5 feet of your target, your first weapon hit against that target deals 1d8 extra damage. You cannot guide yourself.', null, 0],
      [15, 'Homeward Star', 'Once per Long Rest as an Action teleport yourself and up to two willing creatures within 5 feet to a visible unoccupied location within 60 feet. Each destination must support the creature. This ends Chart the Passage.', 'homeward', 1],
    ], pools: { passage: { max: 3, short: 1 }, homeward: { max: 1, level: 15 } } },
  { id: 'mangrove-stalker', name: 'Mangrove Stalker', callingId: 'navigator', identity: 'Busha ambusher who turns cover into patient pressure.', choice: ['snare', 'camouflage'],
    features: [
      [3, 'Rooted Ambush', 'Choose snare or camouflage. Once per turn when you hit a creature marked by your Hunters Mark, spend one Thicket use to deal 1d6 extra Piercing damage. Snare forces a Might save against your spell DC or reduces its Speed to 0 until your next turn; camouflage lets you Hide immediately as part of the attack if you have cover or heavy obscurement.', 'thicket', 1],
      [7, 'Marshborn', 'Gain Resistance to Poison damage and advantage on saves against Poisoned. Nonmagical plants do not cost you extra movement or deal damage when you pass through them.', null, 0],
      [11, 'Patient Predator', 'The extra damage of Rooted Ambush becomes 2d6. Once on each of your turns, if you started the turn Hidden from your marked target, you can move 10 feet without ending Hidden until you leave cover.', null, 0],
      [15, 'Vanish into Green', 'As a Reaction when a creature you see hits you with an attack, spend one Thicket use to halve the damage and move 10 feet. This movement provokes Opportunity Attacks normally. You may Hide if you end in cover.', 'thicket', 1],
    ], resistances: [[7, 'poison']], pools: { thicket: { max: 3, short: 1 } } },
  { id: 'memory-echo', name: 'Memory Echo', callingId: 'tidecaller', identity: 'Lilin memory mage who reshapes minds and communication.', choice: ['memory', 'voice'],
    features: [
      [3, 'Borrowed Voice', 'Choose memory or voice. Gain Training in Read (memory) or Deceive (voice), or Expertise if already Trained. You can communicate telepathically with one willing creature within 30 feet that understands a language. As a Reaction spend one Echo use to add 1d6 to your failed Spirit or Instinct save; decide after the roll.', 'echo', 1],
      [6, 'Recalled Pattern', 'When a creature succeeds on a save against your Enchantment spell, you may spend two Sorcery Points to learn whether it is immune to Charmed. You can then move 10 feet without provoking Opportunity Attacks. This does not change the save result.', 'sorcery-points', 2],
      [14, 'Shared Recollection', 'As an Action spend one Echo use to link up to Training Bonus willing creatures within 30 feet for one hour. Each can communicate telepathically with the others within one mile. You must Concentrate as if on a spell.', 'echo', 1],
      [18, 'Unwritten Self', 'Once per Long Rest, as a Reaction when you fail an Wit, Instinct or Spirit save, succeed instead. End one Charmed or Frightened condition on yourself. This cannot reverse damage already resolved.', 'unwritten', 1],
    ], pools: { echo: { max: 3, short: 1 }, unwritten: { max: 1, level: 18 } } },
  { id: 'tempest-heart', name: 'Tempest Heart', callingId: 'tidecaller', identity: 'Silvian storm channeler balancing wind and lightning.', choice: ['lightning', 'thunder'],
    features: [
      [3, 'Storm Pulse', 'Choose Lightning or Thunder. Gain Resistance to the chosen damage type. Once per turn when you cast a level 1+ spell, spend one Pulse use to move 10 feet without provoking Opportunity Attacks and deal chosen-type damage equal to your Spirit modifier (minimum one) to one creature within 10 feet.', 'pulse', 1],
      [6, 'Conductive Soul', 'Once per turn when your spell deals the chosen damage type, add your Spirit modifier to one damage roll. As a Bonus Action spend two Sorcery Points to change one spells Lightning damage to Thunder or Thunder to Lightning for that casting.', 'sorcery-points', 2],
      [14, 'Eye of the Storm', 'Gain a Fly Speed of 30 feet while not wearing Heavy armor. When you use Storm Pulse, you may carry one willing adjacent creature of your size or smaller through the movement; it must end in an unoccupied space.', null, 0],
      [18, 'Living Tempest', 'Once per Long Rest as a Bonus Action become a storm for one minute. Your Fly Speed becomes 60 feet; you have Immunity to your chosen damage type and Resistance to the other. You may move through creatures as Difficult Terrain, but cannot end there.', 'tempest', 1],
    ], fly: [[14, 30]], pools: { pulse: { max: 3, short: 1 }, tempest: { max: 1, level: 18 } } },
  { id: 'sanguine-conduit', name: 'Sanguine Conduit', callingId: 'tidecaller', identity: 'Purapet life-current mage who risks personal vitality.', choice: ['shelter', 'surge'],
    features: [
      [3, 'Blood Price', 'Choose shelter or surge. As a Bonus Action spend one Conduit use and lose Health equal to twice your Training Bonus (this cannot be reduced and cannot reduce you below 1). Shelter grants one creature within 30 feet temporary Health equal to 1d8 + Spirit; surge adds 1d8 Necrotic damage to one damage roll of the next spell you cast before your next turn.', 'conduit', 1],
      [6, 'Measured Sacrifice', 'Gain Resistance to Necrotic damage. Blood Price uses 2d8 instead of 1d8. Once per Long Rest, as a Bonus Action lose 6 Health without reducing yourself below 1 to recover two Sorcery Points, never above your maximum.', 'transfusion', 1],
      [14, 'Vital Circuit', 'When a creature within 30 feet loses temporary Health granted by Blood Price, you may use your Reaction to grant another creature within 30 feet temporary Health equal to your Spirit modifier (minimum one). This grants no healing and cannot trigger itself.', null, 0],
      [18, 'Unbroken Current', 'Once per Long Rest when reduced to 0 Health but not killed outright, as a Reaction remain at 1 Health and gain temporary Health equal to your Tidecaller level. Blood Price now uses 3d8.', 'unbroken-current', 1],
    ], resistances: [[6, 'necrotic']], pools: { conduit: { max: 3, short: 1 }, transfusion: { max: 1, level: 6 }, 'unbroken-current': { max: 1, level: 18 } } },
  { id: 'oath-of-the-free-port', name: 'Oath of the Free Port', callingId: 'warden', identity: 'Free Captain sworn against captivity and coercion.', choice: ['liberty', 'refuge'],
    features: [
      [3, 'Break the Chain', 'Choose liberty or refuge. As an Action expend one Channel Divinity use to end Grappled or Restrained on a creature within 30 feet; magical restraints require a Spirit check against the effect save DC. Liberty also moves it 10 feet without Opportunity Attacks; refuge grants temporary Health equal to your Warden level.', 'channel-divinity', 1],
      [7, 'Aura of Passage', 'While your Aura of Protection is active, allies in it ignore nonmagical Difficult Terrain and have advantage on checks to escape Grappled. This does not grant immunity to movement-reducing spells.', null, 0],
      [15, 'No Captive Left', 'As a Reaction when an ally within your aura fails a save against Restrained or Paralyzed, spend 5 Lay On Hands points to let it reroll the save. It must use the new result. This does not restore Health.', 'lay-on-hands', 5],
      [20, 'Open Harbor', 'Once per Long Rest as a Bonus Action empower your aura for ten minutes. Allies within it have advantage on saves against Paralyzed and Restrained, and can Disengage as a Bonus Action. Restore this use by expending a level 5 spell slot.', 'open-harbor', 1],
    ], pools: { 'open-harbor': { max: 1, level: 20 } } },
  { id: 'iron-covenant', name: 'Iron Covenant', callingId: 'warden', identity: 'Yuma sworn defender who makes discipline a shared shield.', choice: ['bulwark', 'sentinel'],
    features: [
      [3, 'Covenant of Steel', 'Choose bulwark or sentinel. As a Bonus Action spend one Channel Divinity use to empower one Shield you hold for one minute. Bulwark adds +1 Guard while holding it; sentinel allows you to use a Reaction to impose disadvantage on one attack against an ally within 5 feet. The effect ends if you release the Shield.', 'channel-divinity', 1],
      [7, 'Aura of Resolve', 'While your Aura of Protection is active, allies in it have advantage on saves against forced movement and against being knocked Prone. You must be conscious.', null, 0],
      [15, 'Take the Burden', 'As a Reaction when an ally in your aura takes damage, spend one Covenant use to take half that damage instead. This transferred damage cannot be reduced; the ally takes the remainder.', 'covenant', 1],
      [20, 'Unyielding Standard', 'Once per Long Rest as a Bonus Action for one minute, gain Resistance to Bludgeoning, Piercing and Slashing and prevent enemies from moving you against your will. Allies in your aura gain temporary Health equal to your Spirit modifier at the start of each of their turns. Restore the use with a level 5 spell slot.', 'standard', 1],
    ], pools: { covenant: { max: 3, level: 15, short: 1 }, standard: { max: 1, level: 20 } } },
  { id: 'lantern-vigil', name: 'Lantern Vigil', callingId: 'warden', identity: 'Faith Order keeper against the drowned dead and corrupted spirits.', choice: ['radiant', 'fire'],
    features: [
      [3, 'Light the Watch', 'Choose Radiant or Fire. As a Bonus Action spend one Channel Divinity use to create a 20-foot Bright Light aura for one minute. Once on each of your turns your first weapon hit deals 1d6 extra chosen-type damage. Undead hit by it cannot regain Health until your next turn.', 'channel-divinity', 1],
      [7, 'Aura of Clear Sight', 'While your Aura of Protection is active, you and allies in it can see through nonmagical fog and have advantage on saves against Frightened caused by Undead. This does not pierce magical darkness.', null, 0],
      [15, 'Watchfire', 'Gain Resistance to Necrotic damage. Your Light the Watch extra damage becomes 2d6. As an Action you can spend 5 Lay On Hands points to end one Charmed effect caused by an Undead on a creature you touch.', 'lay-on-hands', 5],
      [20, 'Dawn at Sea', 'Once per Long Rest as a Bonus Action empower your aura for one minute. It becomes sunlight; Undead starting a turn in it take Radiant damage equal to your Training Bonus + Spirit modifier. You and allies in it have Resistance to Necrotic damage. Restore this use with a level 5 spell slot.', 'dawn', 1],
    ], resistances: [[15, 'necrotic']], pools: { dawn: { max: 1, level: 20 } } },
  { id: 'thunderhide', name: 'Thunderhide', callingId: 'reaver', identity: 'Akshan storm runner who uses Rage to dominate space.', choice: ['thunder', 'lightning'],
    features: [
      [3, 'Stormhide', 'Choose Thunder or Lightning. While Raging gain Resistance to the chosen type. Once on each of your turns when a Might-based melee attack hits during Rage, deal chosen-type damage equal to your Rage Damage bonus. As a Bonus Action spend one Stormhide use to leap 15 feet; movement provokes normally.', 'stormhide', 1],
      [6, 'Weather the Blow', 'Gain permanent Resistance to your chosen type. When a creature hits you with a melee attack while you Rage, you may use your Reaction to deal chosen-type damage equal to your Resolve modifier (minimum one) to it.', null, 0],
      [10, 'Thunderous Landing', 'When you use the Stormhide leap, each creature of your choice within 5 feet of your landing space makes a Might save (DC 8 + Training Bonus + Might) or falls Prone. You must land on a supporting surface.', null, 0],
      [14, 'Walking Storm', 'Once per Rage as a Bonus Action spend one Stormhide use to emit a 10-foot Emanation until your next turn. Enemies that start a turn there make a Resolve save against your Stormhide DC, taking 3d6 chosen-type damage on failure or half on success.', 'stormhide', 1],
    ], pools: { stormhide: { max: 3, short: 1 } } },
  { id: 'chainbreaker', name: 'Chainbreaker', callingId: 'reaver', identity: 'Yayimi liberator who breaks holds and protects comrades.', choice: ['rescuer', 'breaker'],
    features: [
      [3, 'Break Their Hold', 'Choose rescuer or breaker. While Raging, once per turn when you hit with a Might-based melee attack, deal extra damage equal to your Rage Damage bonus if the target is Grappling an ally or carrying restraints. As a Bonus Action spend one Freedom use to let an adjacent ally immediately attempt to escape a grapple, using your Might (Athletics) modifier.', 'freedom', 1],
      [6, 'Refuse the Yoke', 'While Raging, you have advantage on saves against Paralyzed and Restrained. Rescuer lets an ally within 5 feet use the same advantage; breaker doubles your weapon damage against nonmagical restraints and unattended doors.', null, 0],
      [10, 'Rally the Bound', 'As an Action spend one Freedom use: up to three allies within 30 feet who hear you gain temporary Health equal to 1d8 + Resolve modifier. They can stand from Prone without spending movement.', 'freedom', 1],
      [14, 'None Shall Kneel', 'Once per Long Rest as a Reaction when an ally within 30 feet fails a save against Charmed, Frightened or Restrained, let it succeed instead. You must be Raging and able to see the ally.', 'none-kneel', 1],
    ], pools: { freedom: { max: 3, short: 1 }, 'none-kneel': { max: 1, level: 14 } } },
  { id: 'reef-colossus', name: 'Reef Colossus', callingId: 'reaver', identity: 'Rukkan boarding giant who trades speed for inexorable force.', choice: ['anchor', 'breaker'],
    features: [
      [3, 'Colossus Stance', 'Choose anchor or breaker. While Raging, you count as one size larger for carrying and grappling, to a maximum effective size of Large. Anchor grants advantage on saves against being moved; breaker adds your Rage Damage bonus to damage against objects. As a Bonus Action spend one Colossus use to gain temporary Health equal to your Reaver level + Resolve modifier.', 'colossus', 1],
      [6, 'Reef Skin', 'While Raging and not wearing Heavy armor, reduce Bludgeoning, Piercing or Slashing damage from each attack by your Training Bonus after applying Resistance, to a minimum of 0. Your Speed is reduced by 5 feet while this benefit applies; you can suppress it until your next turn.', null, 0],
      [10, 'Deckshaker', 'As an Action during Rage spend one Colossus use: creatures of your choice within 10 feet make a Might save (DC 8 + Training Bonus + Might), taking 3d8 Bludgeoning damage and falling Prone on failure, or half damage on success. This is not the Attack action.', 'colossus', 1],
      [14, 'Mountain in the Strait', 'While Raging your reach for melee weapon attacks increases by 5 feet on your turn. Deckshaker damage becomes 5d8. Once per Long Rest when initiative is rolled with no Colossus uses, regain one.', null, 0],
    ], pools: { colossus: { max: 3, short: 1 }, 'colossus-reserve': { max: 1, level: 14 } } },
  { id: 'plaguewarden', name: 'Plaguewarden', callingId: 'doctor', identity: 'Purapet apothecary who contains poison and disease.', choice: ['antidote', 'quarantine'],
    features: [
      [3, 'Contain the Fever', 'Choose antidote or quarantine. Gain herbalism kit Training. As an Action expend one Channel Divinity use: antidote ends Poisoned on up to two creatures within 30 feet; quarantine forces one creature within 30 feet to make a Resolve save against your spell DC or have its Speed halved and lose Reactions for one minute (repeat save each turn).', 'channel-divinity', 1],
      [6, 'Inoculated', 'Gain Resistance to Poison damage and advantage on saves against Poisoned. When you restore Health with a level 1+ spell, one healed creature has advantage on its next save against Poisoned within one hour.', null, 0],
      [17, 'Clean Bill of Health', 'Once per Long Rest as an Action restore 6d8 + Doctor level Health to one creature within reach and end Poisoned, Blinded and Deafened on it. You must expend one healer kit use. This cannot cure magical curses or restore missing body parts.', 'clean-bill', 1],
    ], resistances: [[6, 'poison']], pools: { 'clean-bill': { max: 1, level: 17 } } },
  { id: 'keeper-of-last-breaths', name: 'Keeper of Last Breaths', callingId: 'doctor', identity: 'Kirkian grief keeper who guards the boundary of death.', choice: ['comfort', 'witness'],
    features: [
      [3, 'Stay the Crossing', 'Choose comfort or witness. As a Reaction when a creature within 30 feet falls to 0 Health but is not killed outright, spend one Vigil use to stabilize it. Comfort also grants temporary Health equal to your Instinct modifier (minimum one), which does not awaken it; witness lets it speak one sentence even while Unconscious.', 'vigil', 1],
      [6, 'Witness Against Oblivion', 'As an Action expend one Channel Divinity use to restore Health equal to twice your Doctor level to a creature at 0 Health within 30 feet. It can then stand without spending movement. This does not return a dead creature to life.', 'channel-divinity', 1],
      [17, 'One More Dawn', 'Once per Long Rest as a Reaction when a creature within 30 feet would die from failed death saves, restore it to 1 Health instead and reset its death saves. This cannot prevent instant death from massive damage or disintegration.', 'one-dawn', 1],
    ], pools: { vigil: { max: 3, short: 1 }, 'one-dawn': { max: 1, level: 17 } } },
  { id: 'sparkwrite-aetherist', name: 'Sparkwrite Aetherist', callingId: 'shipwright', identity: 'Yuma experimental arcanist who stores spells in unstable relays.', choice: ['grounded', 'mobile'],
    features: [
      [3, 'Aether Relay', 'Choose grounded or mobile. Gain tinker tools Training. As a Bonus Action spend one Relay use to place a relay in an unoccupied space within 30 feet for one minute. You may originate one Shipwright cantrip per turn from that relay, measuring range from it while still requiring your own sight. Grounded grants the relay Guard 15 and Health equal to twice Shipwright level; mobile lets you move it 15 feet as a Bonus Action. One relay at a time.', 'relay', 1],
      [6, 'Grounding Circuit', 'While within 10 feet of your relay, gain Resistance to Lightning damage and advantage on Resolve saves to maintain Concentration. If the relay is destroyed, the benefits end.', null, 0],
      [10, 'Capacitor Discharge', 'As an Action spend one Relay use to detonate your relay. Creatures within 10 feet make an Agility save against your spell DC, taking 4d8 Lightning damage on failure or half on success. The relay is destroyed; you cannot exempt allies.', 'relay', 1],
      [14, 'Twin Circuit', 'You may maintain two relays. Each time you cast a Shipwright spell of level 1 or higher, you can teleport between two of your relays within 60 feet of each other, once per turn. Capacitor Discharge damage becomes 6d8.', null, 0],
    ], pools: { relay: { max: 3, short: 1 } } },
];
function install(rules) {
  const { callings, slug } = require('./catalog');
  for (const design of designs) {
    const levels = callings[design.callingId].pathLevels;
    const path = { id: design.id, name: design.name, callingId: design.callingId,
      description: design.identity, status: 'available', source, featureLevels: levels,
      grants: [], spellsByCallingLevel: {}, choices: { 3: { key: 'pathDiscipline', options: design.choice } },
      pools: design.pools, design };
    if (JSON.stringify(design.features.map(f => f[0])) !== JSON.stringify(levels))
      throw Error('Incomplete original Path schedule: ' + design.id);
    for (const [callingLevel, name, description, pool, cost, extraPool] of design.features) {
      const id = `path:${path.id}:${slug(name)}:${callingLevel}`;
      path.grants.push(id);
      const poolId = pool && (['sorcery-points', 'channel-divinity', 'lay-on-hands'].includes(pool)
        ? `${path.callingId}:${pool}` : `${path.id}:${pool}`);
      rules.features.push({ id, ownerId: path.id, ownerType: 'path', callingLevel, name,
        sourceName: name, description, source, rulesStatus: 'tabletop-rules', automationStatus: 'character-costs-implemented',
        missingSourceLines: [], ...(poolId ? { action: { costs: [{ poolId, amount: cost },
          ...(extraPool ? [{ poolId: `${path.id}:${extraPool}`, amount: 1 }] : [])] } } : {}) });
    }
    rules.paths.push(path);
  }
  return rules;
}
module.exports = { install, designs };
