module.exports = {
  sampleCharacter: {
    name: "Mara Voss",
    pronouns: "she/her",
    identity: {
      background: {
        origin: "Yayimi",
        pastRole: "Strike courier",
        definingEvent: "Carried a payroll ledger out of a burning customs tower",
      },
      tags: [
        {
          key: "shipborn",
          label: "Shipborn",
          mechanicalImpact: "Advantage on early-scene balance, climb, and vessel movement checks.",
        },
        {
          key: "blacklisted",
          label: "Blacklisted",
          mechanicalImpact: "Official checkpoints clock her immediately; rebel cells trust her one step faster.",
        },
        {
          key: "engineer",
          label: "Engineer",
          mechanicalImpact: "May Patch or Jury-Rig without a toolkit once per scene.",
        },
        {
          type: "trait",
          key: "dockside-memory",
          label: "Dockside Memory",
          mechanicalImpact:
            "Once per session, recall a hidden route, old invoice trail, or overlooked maintenance access point.",
        },
      ],
    },
    attributes: {
      might: 2,
      agility: 3,
      wit: 4,
      spirit: 1,
      resolve: 3,
      instinct: 2,
    },
    skills: {
      combat: [{ id: "shoot", rank: 2 }, { id: "suppress", rank: 1 }],
      social: [{ id: "read", rank: 2 }, { id: "threaten", rank: 1 }],
      exploration: [{ id: "navigate", rank: 1 }, { id: "endure", rank: 1 }],
      utility: [
        { id: "jury-rig", rank: 3 },
        { id: "patch", rank: 2 },
        { id: "signal", rank: 2 },
        { id: "salvage", rank: 1 },
      ],
      arcane: [{ id: "attune", rank: 1 }],
    },
    abilities: [
      {
        id: "hardseal-burst",
        name: "Hardseal Burst",
        type: "active",
        cost: { resource: "stamina", amount: 2 },
        scaling: { attribute: "wit", skill: "jury-rig" },
        tags: ["utility", "tech", "combat"],
        effect:
          "Seal a breach, weapon jam, or bleeding wound in your zone. If used on gear, the next allied action with it gains advantage.",
      },
    ],
    resources: {
      health: { current: 12, max: 12 },
      wounds: {
        current: 1,
        max: 4,
        active: [
          {
            name: "Burned Palm",
            severity: "minor",
            statPenalty: "agility",
            description: "Palm wrapped in treated cloth after a refinery fire. Fine tool work stays painful until treated.",
          },
        ],
      },
      stamina: { current: 7, max: 7 },
      focus: { current: 4, max: 4 },
      corruption: { current: 0, max: 6 },
    },
    reputation: {
      yumaRepublic: -2,
      lilinEmpire: 0,
      freeCaptains: 1,
      rebelMovements: 2,
      guildConsortium: 1,
      nobleCourts: -1,
      underworld: 1,
      faithOrders: 0,
      seaPeoples: 0,
      frontierTribes: 0,
    },
    equipment: {
      weapons: [{ id: "weapon_rivet_carbine", name: "Rivet Carbine", type: "weapon", skillLinks: ["shoot", "suppress"] }],
      armor: [{ id: "armor_pressure_coat", name: "Pressure Coat", type: "armor", skillLinks: ["brace", "endure"] }],
      techRelics: [{ id: "tech_whisper_spool", name: "Whisper Spool", type: "tech", skillLinks: ["signal", "read"] }],
      cargo: [{ id: "cargo_spare_seals", name: "Spare Seals", type: "cargo" }],
    },
    progression: {
      rank: 2,
      skillPoints: 2,
      advancementPoints: 1,
      specializationPath: "drydock-ghost",
      unlockedNodes: ["ghost-patch", "paid-in-scrap"],
    },
  },
  exampleAbilities: [
    {
      id: "ledger-knives",
      name: "Ledger Knives",
      type: "reaction",
      cost: { resource: "focus", amount: 1 },
      scaling: { attribute: "wit", skill: "read" },
      tags: ["social", "faction", "reaction"],
      effect:
        "When an NPC lies, breaks terms, or hides a clause, expose the angle immediately. On a success, gain leverage and reduce their next social defense by your Read rank.",
    },
    {
      id: "keelbreaker-charge",
      name: "Keelbreaker Charge",
      type: "active",
      cost: { resource: "stamina", amount: 3 },
      scaling: { attribute: "might", skill: "board" },
      tags: ["combat", "boarding", "weapon"],
      effect:
        "Rush into a defended target or structure. On a hit, deal heavy damage and open the zone for one allied follow-up action without opportunity fire.",
    },
    {
      id: "echo-tax",
      name: "Echo Tax",
      type: "active",
      cost: { resource: "corruption", amount: 1 },
      scaling: { attribute: "spirit", skill: "invoke" },
      tags: ["arcane", "control", "risk"],
      effect:
        "Call up the memory of a drowned place to stall everyone in the zone. Enemies lose momentum and take a penalty to movement, but if you fail, your corruption immediately spikes by 1 more.",
    },
  ],
};
