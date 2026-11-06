module.exports = {
  sampleCharacter: {
    name: "Mara Voss",
    calling: "corsair",
    origin: "harshanum",
    attributes: {
      might: 16,
      agility: 14,
      wit: 13,
      spirit: 12,
      resolve: 10,
      instinct: 8,
    },
    training: ["board", "shoot", "deceive", "navigate"],
    resources: {
      health: { current: 15, max: 15 },
      stamina: { current: 15, max: 15 },
      focus: { current: 12, max: 12 },
      wounds: { current: 0, max: 3, active: [] },
      corruption: { current: 0, max: 6 },
    },
    inventory: [
      {
        instanceId: "sample-cutlass-instance",
        definitionId: "cutlass",
        quantity: 1,
        customName: "",
        notes: "",
      },
    ],
    loadout: {
      mainHand: "sample-cutlass-instance",
      offHand: null,
      armor: null,
      grip: "one",
    },
    progression: {
      rank: 1,
      advancementPoints: 0,
      specializationPath: "",
      unlockedNodes: [],
    },
  },
};
