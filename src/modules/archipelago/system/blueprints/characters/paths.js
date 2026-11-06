module.exports = [
    {
      id: "drydock-ghost",
      name: "Drydock Ghost",
      summary:
        "A sabotage-and-survival path built around ship systems, hidden routes, and making damaged infrastructure work for you.",
      recommendedCallings: ["navigator", "gunslinger"],
      affinity: {
        categories: ["utility", "exploration"],
        specialties: ["jury-rig", "navigate", "scout"],
      },
      nodes: [
        {
          id: "ghost-patch",
          name: "Ghost Patch",
          rankRequired: 2,
          cost: 1,
          summary: "Your repairs leave no obvious trace until the moment they matter.",
          effect:
            "When you Patch or Jury-Rig during a scene, the fix also masks tampering. The first enemy inspection against it is made with disadvantage.",
        },
        {
          id: "paid-in-scrap",
          name: "Paid in Scrap",
          rankRequired: 2,
          cost: 1,
          summary: "Broken things become inventory instead of waste.",
          effect:
            "After a fight, collapse, or sabotage, salvage one useful component without spending extra downtime. The first related crafting check gains advantage.",
        },
        {
          id: "silent-keel",
          name: "Silent Keel",
          rankRequired: 3,
          cost: 2,
          summary: "You move a vessel or machine through dangerous spaces without announcing it.",
          effect:
            "Once per scene, reduce the detection profile of a ship, engine room, or moving platform. Allies gain advantage on the next stealth, escape, or infiltration action tied to it.",
        },
      ],
    },
    {
      id: "storm-broker",
      name: "Storm Broker",
      summary:
        "A control path for captains and ritual tacticians who turn weather, timing, and leverage into battlefield dominance.",
      recommendedCallings: ["navigator", "tidecaller"],
      affinity: {
        categories: ["arcane", "exploration", "social"],
        specialties: ["attune", "navigate", "command", "bargain"],
      },
      nodes: [
        {
          id: "barometer-instinct",
          name: "Barometer Instinct",
          rankRequired: 2,
          cost: 1,
          summary: "You feel the turn of pressure before everyone else does.",
          effect:
            "At the start of a scene, ask one question about incoming danger, weather, or reinforcement timing. Your next related Sense, Navigate, or Attune check gains advantage.",
        },
        {
          id: "borrowed-squall",
          name: "Borrowed Squall",
          rankRequired: 3,
          cost: 2,
          summary: "You can throw confusion into one zone by calling the edge of a storm.",
          effect:
            "Spend 1 Focus to impose poor visibility, unstable footing, or signal interference in a nearby zone until your next turn.",
        },
        {
          id: "captains-credit",
          name: "Captain's Credit",
          rankRequired: 4,
          cost: 2,
          summary: "When your call is right, it pays the whole crew back.",
          effect:
            "After an ally succeeds on a setup, maneuver, or repositioning action you created, recover 1 shared specialty pick or 1 Focus for that ally once per scene.",
        },
      ],
    },
    {
      id: "reef-knife",
      name: "Reef Knife",
      summary:
        "A duelist-infiltrator path for characters who strike from angles, thrive in cramped fights, and weaponize concealment.",
      recommendedCallings: ["corsair", "gunslinger", "reaver"],
      affinity: {
        categories: ["combat", "exploration"],
        specialties: ["board", "shoot", "scout", "feint", "suppress"],
      },
      nodes: [
        {
          id: "close-water",
          name: "Close Water",
          rankRequired: 2,
          cost: 1,
          summary: "Tight spaces are where you become dangerous.",
          effect:
            "Gain advantage on your first melee or sidearm attack each scene made from cover, concealment, or within a cramped zone.",
        },
        {
          id: "hookline-feint",
          name: "Hookline Feint",
          rankRequired: 3,
          cost: 1,
          summary: "Your movement pulls attention away from the real threat.",
          effect:
            "After you reposition, one ally attacking the same target before your next turn gains advantage or +1 effect.",
        },
        {
          id: "bloodwake",
          name: "Bloodwake",
          rankRequired: 4,
          cost: 2,
          summary: "A clean takedown turns the whole deck in your favor.",
          effect:
            "When you drop a target, choose another enemy in the zone: it loses its reaction or suffers disadvantage on its next Guard check.",
        },
      ],
    },
    {
      id: "powder-saint",
      name: "Powder Saint",
      summary:
        "A volatile invention path for black-powder tacticians, artificers, and battlefield problem-solvers who treat risk like fuel.",
      recommendedCallings: ["gunslinger", "navigator"],
      affinity: {
        categories: ["utility", "combat"],
        specialties: ["shoot", "suppress", "jury-rig", "calibrate"],
      },
      nodes: [
        {
          id: "measured-burn",
          name: "Measured Burn",
          rankRequired: 2,
          cost: 1,
          summary: "You know exactly how much chaos a device can survive.",
          effect:
            "The first explosive, gadget, or firearm complication you trigger each scene is reduced by 1 severity.",
        },
        {
          id: "ember-route",
          name: "Ember Route",
          rankRequired: 3,
          cost: 1,
          summary: "Smoke and sparks become part of your map.",
          effect:
            "After using a powder, signal, or volatile tech effect, gain advantage on the next reposition, escape, or suppress action in that zone.",
        },
        {
          id: "saints-rebuke",
          name: "Saint's Rebuke",
          rankRequired: 4,
          cost: 2,
          summary: "Your heaviest shot leaves doctrine behind and fear in front of it.",
          effect:
            "Once per scene, a firearm or explosive hit also shatters cover, breaks formation, or forces a morale check from nearby enemies.",
        },
      ],
    },
    {
      id: "leviathan-anchor",
      name: "Leviathan Anchor",
      summary:
        "A protection path for defenders who turn themselves into the line the rest of the crew can stand behind.",
      recommendedCallings: ["warden", "corsair"],
      affinity: {
        categories: ["combat", "social"],
        specialties: ["brace", "threaten", "endure", "command"],
      },
      nodes: [
        {
          id: "braced-soul",
          name: "Braced Soul",
          rankRequired: 2,
          cost: 1,
          summary: "You hold steady even when the whole scene wants to move you.",
          effect:
            "The first forced movement, stagger, or panic effect against you each scene is ignored. An adjacent ally gains +1 Guard against the same source.",
        },
        {
          id: "chain-of-duty",
          name: "Chain of Duty",
          rankRequired: 3,
          cost: 1,
          summary: "Protection ripples outward from your position.",
          effect:
            "When you Intercept, Brace, or otherwise cover an ally, one second nearby ally gains advantage on its next Endure, Guard, or retreat action.",
        },
        {
          id: "harbor-oath",
          name: "Harbor Oath",
          rankRequired: 4,
          cost: 2,
          summary: "Once you take the line, enemies have to break themselves on it.",
          effect:
            "Once per scene, mark your zone as defended until your next turn. Enemies entering or forcing movement through it suffer disadvantage unless they pay extra resources or setup.",
        },
      ],
    },
    {
      id: "omen-diver",
      name: "Omen Diver",
      summary:
        "An arcane path for characters who push deeper into relic resonance, drowned memory, and dangerous communion with the unseen.",
      recommendedCallings: ["tidecaller", "navigator"],
      affinity: {
        categories: ["arcane", "utility"],
        specialties: ["attune", "read", "sift", "jury-rig"],
      },
      nodes: [
        {
          id: "undertow-listen",
          name: "Undertow Listen",
          rankRequired: 2,
          cost: 1,
          summary: "The drowned world answers if you are willing to hear it.",
          effect:
            "Once per scene, ask one question of a relic, haunted site, or spirit current. Your next Attune, Invoke, or Read check against it gains advantage.",
        },
        {
          id: "salt-memory",
          name: "Salt Memory",
          rankRequired: 3,
          cost: 1,
          summary: "Old scenes cling to you long enough to be useful.",
          effect:
            "After using an arcane ability, capture one fleeting clue, echo, or emotional imprint about the zone without spending extra Focus.",
        },
        {
          id: "sunken-price",
          name: "Sunken Price",
          rankRequired: 4,
          cost: 2,
          summary: "You can borrow power from corruption and decide later how to pay it back.",
          effect:
            "Once per session, reduce the cost of an arcane ability by 1 Focus or 1 Corruption. After the scene, the GM introduces a spiritual consequence tied to what answered you.",
        },
      ],
    },
  ];
