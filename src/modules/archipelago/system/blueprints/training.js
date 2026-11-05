// Canonical binary proficiencies; no fixed attributes or rank effects.
module.exports = [
  {
    "id": "board",
    "name": "Board",
    "category": "combat",
    "description": "Crash through contested space, claim footing, and make the deck belong to your crew.",
    "context": "Boarding actions, melees on unstable ground, and entering defended zones.",
    "tags": [
      "combat",
      "movement",
      "positioning",
      "boarding"
    ]
  },
  {
    "id": "shoot",
    "name": "Shoot",
    "category": "combat",
    "description": "Put a shot exactly where panic, smoke, and motion say it should not land.",
    "context": "Firearms, thrown weapons, shipboard guns, and ranged attacks under pressure.",
    "tags": [
      "combat",
      "ranged",
      "attack",
      "marksman"
    ]
  },
  {
    "id": "cut",
    "name": "Cut",
    "category": "combat",
    "description": "Fight in reach, tear openings, and punish the heartbeat when a guard fails.",
    "context": "Blades, hooks, close-quarters weapons, and punishing enemies who overextend.",
    "tags": [
      "combat",
      "melee",
      "attack",
      "dueling"
    ]
  },
  {
    "id": "brace",
    "name": "Brace",
    "category": "combat",
    "description": "Plant your stance, absorb impact, and protect ground when the world tries to move you.",
    "context": "Forced movement, knockback, collisions, shield walls, and protecting allies in tight quarters.",
    "tags": [
      "combat",
      "defense",
      "stability",
      "protector"
    ]
  },
  {
    "id": "feint",
    "name": "Feint",
    "category": "combat",
    "description": "Sell a false opening, pull an enemy off rhythm, and punish the moment they believe you.",
    "context": "Duels, misdirection in close combat, baiting reactions, and setting up precision strikes.",
    "tags": [
      "combat",
      "misdirection",
      "dueling",
      "setup"
    ]
  },
  {
    "id": "suppress",
    "name": "Suppress",
    "category": "combat",
    "description": "Control lanes with threat, pressure, and timing until movement becomes a costly choice.",
    "context": "Covering fire, chokepoints, ship decks, retreats, and protecting fragile objectives.",
    "tags": [
      "combat",
      "control",
      "ranged",
      "area-denial"
    ]
  },
  {
    "id": "bargain",
    "name": "Bargain",
    "category": "social",
    "description": "Turn leverage, favors, and timing into a deal both sides can survive.",
    "context": "Markets, treaties, settlement favors, ship contracts, ransom talks, and tense negotiations.",
    "tags": [
      "social",
      "trade",
      "negotiation",
      "leverage"
    ]
  },
  {
    "id": "command",
    "name": "Command",
    "category": "social",
    "description": "Speak with the weight that makes hesitation feel more dangerous than obedience.",
    "context": "Crew orders, battlefield direction, intimidation through authority, and crisis leadership.",
    "tags": [
      "social",
      "authority",
      "leadership",
      "crew"
    ]
  },
  {
    "id": "deceive",
    "name": "Deceive",
    "category": "social",
    "description": "Build a lie sturdy enough for someone else to stand on it before it breaks.",
    "context": "False identities, hidden motives, misdirection, and covering illicit action.",
    "tags": [
      "social",
      "deception",
      "infiltration",
      "mask"
    ]
  },
  {
    "id": "read",
    "name": "Read",
    "category": "social",
    "description": "Catch what people hide in posture, silence, timing, and the things they refuse to name.",
    "context": "Interviews, negotiations, ambush tells, court intrigue, and reading a room.",
    "tags": [
      "social",
      "insight",
      "leverage",
      "tells"
    ]
  },
  {
    "id": "perform",
    "name": "Perform",
    "category": "social",
    "description": "Turn attention into a tool, a veil, or a weapon with rhythm and ceremony.",
    "context": "Crowds, rituals, distractions, reputation plays, and commanding attention.",
    "tags": [
      "social",
      "performance",
      "attention",
      "ceremony"
    ]
  },
  {
    "id": "threaten",
    "name": "Threaten",
    "category": "social",
    "description": "Make consequences vivid enough that surrender starts sounding like wisdom.",
    "context": "Stand-offs, interrogation, deterrence, and forcing hesitation without immediate violence.",
    "tags": [
      "social",
      "intimidation",
      "leverage",
      "deterrence"
    ]
  },
  {
    "id": "navigate",
    "name": "Navigate",
    "category": "exploration",
    "description": "Find the route the map forgot and the storm has not swallowed yet.",
    "context": "Sea routes, storm paths, jungle lines, urban shortcuts, and long journeys.",
    "tags": [
      "exploration",
      "travel",
      "route",
      "charts"
    ]
  },
  {
    "id": "scout",
    "name": "Scout",
    "category": "exploration",
    "description": "Move ahead of certainty and return with the truth before danger has teeth.",
    "context": "Recon, watches, advance movement, ambush avoidance, and hidden approaches.",
    "tags": [
      "exploration",
      "recon",
      "stealth",
      "watch"
    ]
  },
  {
    "id": "track",
    "name": "Track",
    "category": "exploration",
    "description": "Follow pressure, spoor, habit, and absence until the quarry becomes a story you can read.",
    "context": "Pursuits, missing people, beast trails, battlefield clues, and forensic traces.",
    "tags": [
      "exploration",
      "pursuit",
      "clues",
      "hunt"
    ]
  },
  {
    "id": "endure",
    "name": "Endure",
    "category": "exploration",
    "description": "Keep moving when hunger, weather, pain, and fear all vote against you.",
    "context": "Forced marches, exposure, starvation, storm watches, and prolonged strain.",
    "tags": [
      "exploration",
      "survival",
      "resilience",
      "hardship"
    ]
  },
  {
    "id": "climb",
    "name": "Climb",
    "category": "exploration",
    "description": "Make rigging, cliffs, wreckage, and walls into roads no one else noticed.",
    "context": "Rigging, cliffs, ruins, walls, collapsing structures, and vertical escapes.",
    "tags": [
      "exploration",
      "movement",
      "vertical",
      "escape"
    ]
  },
  {
    "id": "dive",
    "name": "Dive",
    "category": "exploration",
    "description": "Work where breath is a timer and pressure turns every mistake into a debt.",
    "context": "Underwater salvage, flooded ruins, pressure locks, and breath-limited action.",
    "tags": [
      "exploration",
      "water",
      "salvage",
      "pressure"
    ]
  },
  {
    "id": "jury-rig",
    "name": "Jury-Rig",
    "category": "utility",
    "description": "Make broken things work just long enough for the next impossible minute.",
    "context": "Temporary repairs, emergency tools, field improvisation, unstable mechanisms, and ugly miracles.",
    "tags": [
      "utility",
      "repair",
      "improvisation",
      "fieldwork"
    ]
  },
  {
    "id": "stabilize",
    "name": "Stabilize",
    "category": "utility",
    "description": "Stop the bleeding, panic, overload, or collapse long enough for choice to return.",
    "context": "Emergency medicine, failing systems, panic spirals, riot escalation, and containment moments.",
    "tags": [
      "utility",
      "emergency",
      "support",
      "containment"
    ]
  },
  {
    "id": "calibrate",
    "name": "Calibrate",
    "category": "utility",
    "description": "Tune temperamental tools, engines, scopes, and rituals until exactness becomes possible.",
    "context": "Sensitive instruments, firing solutions, engines, sensors, and controlled procedures.",
    "tags": [
      "utility",
      "precision",
      "systems",
      "preparation"
    ]
  },
  {
    "id": "attune",
    "name": "Attune",
    "category": "arcane",
    "description": "Listen for the mood of relics, spirits, storms, and places that remember blood.",
    "context": "Relics, spirits, corrupted sites, ritual spaces, omens, and unseen pressure before it breaks open.",
    "tags": [
      "arcane",
      "relic",
      "spirit",
      "resonance"
    ]
  },
  {
    "id": "sift",
    "name": "Sift",
    "category": "arcane",
    "description": "Separate omen from fear, residue from rumor, and truth from the noise power leaves behind.",
    "context": "Aftermaths, visions, relic traces, curses, haunted evidence, and magical crime scenes.",
    "tags": [
      "arcane",
      "omens",
      "investigation",
      "echoes"
    ]
  }
];
