module.exports = {
  sampleCharacter: {
    name: 'Mara Voss', calling: 'corsair', origin: 'harshanum',
    attributes: { might: 16, agility: 14, wit: 13, spirit: 12, resolve: 10, instinct: 8 },
    training: ['board', 'shoot', 'deceive', 'navigate'],
    resources: { health: { current: 15, max: 15 }, stamina: { current: 15, max: 15 }, focus: { current: 12, max: 12 }, wounds: { current: 0, max: 3, active: [] }, corruption: { current: 0, max: 6 } },
    progression: { rank: 1, advancementPoints: 0, specializationPath: '', unlockedNodes: [] },
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
