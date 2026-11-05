// Equipment labels are planning metadata, not executable item categories or combat bonuses.
module.exports = {
  "version": 1,
  "skillCount": 4,
  "packageSkillsReplaceable": true,
  "equipmentStatus": "pending-definitions",
  "callings": {
    "corsair": {
      "skills": [
        "climb",
        "threaten"
      ],
      "saves": [
        "agility",
        "resolve"
      ],
      "weapons": [
        "Blades",
        "Boarding weapons",
        "Sidearms"
      ],
      "armor": [
        "Light armor",
        "Shields"
      ],
      "tools": [
        "Rigging and boarding gear"
      ]
    },
    "gunslinger": {
      "skills": [
        "perception",
        "jury-rig"
      ],
      "saves": [
        "agility",
        "wit"
      ],
      "weapons": [
        "Firearms",
        "Thrown weapons",
        "Knives"
      ],
      "armor": [
        "Light armor"
      ],
      "tools": [
        "Firearm maintenance kit"
      ]
    },
    "navigator": {
      "skills": [
        "navigate",
        "command"
      ],
      "saves": [
        "wit",
        "instinct"
      ],
      "weapons": [
        "Blades",
        "Sidearms"
      ],
      "armor": [
        "Light armor"
      ],
      "tools": [
        "Navigation instruments",
        "Vessel helm"
      ]
    },
    "tidecaller": {
      "skills": [
        "attune",
        "lore"
      ],
      "saves": [
        "spirit",
        "resolve"
      ],
      "weapons": [
        "Knives",
        "Staves"
      ],
      "armor": [],
      "tools": [
        "Ritual implements"
      ]
    },
    "warden": {
      "skills": [
        "command",
        "stabilize"
      ],
      "saves": [
        "might",
        "resolve"
      ],
      "weapons": [
        "Blades",
        "Boarding weapons",
        "Polearms"
      ],
      "armor": [
        "Light armor",
        "Heavy armor",
        "Shields"
      ],
      "tools": [
        "Healer’s kit"
      ]
    },
    "reaver": {
      "skills": [
        "track",
        "endure"
      ],
      "saves": [
        "might",
        "instinct"
      ],
      "weapons": [
        "Blades",
        "Boarding weapons",
        "Thrown weapons"
      ],
      "armor": [
        "Light armor"
      ],
      "tools": [
        "Hunting and field-dressing tools"
      ]
    }
  }
};
