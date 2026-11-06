module.exports = {
  corsair: {
    guaranteed: {
      primary: "cutlass",
      armor: "leather-armor",
    },
    choices: {
      secondary: {
        shield: {
          secondary: "shield",
        },
        dagger: {
          secondary: "dagger",
        },
      },
    },
    defaults: {
      mainHand: "primary",
      offHand: "secondary:shield",
      armor: "armor",
      grip: "one",
    },
    id: "corsair",
    version: 1,
  },
  gunslinger: {
    guaranteed: {
      primary: "dagger",
      armor: "leather-armor",
    },
    choices: {
      firearm: {
        pistol: {
          firearm: "pistol",
        },
        musket: {
          firearm: "musket",
        },
      },
    },
    defaults: {
      mainHand: "primary",
      offHand: null,
      armor: "armor",
      grip: "one",
    },
    id: "gunslinger",
    version: 1,
  },
  navigator: {
    guaranteed: {
      backup: "dagger",
      armor: "leather-armor",
    },
    choices: {
      weapon: {
        spear: {
          primary: "spear",
        },
        quarterstaff: {
          primary: "quarterstaff",
        },
      },
    },
    defaults: {
      mainHand: "primary",
      offHand: null,
      armor: "armor",
      grip: "one",
    },
    id: "navigator",
    version: 1,
  },
  tidecaller: {
    guaranteed: {
      backup: "dagger",
    },
    choices: {
      weapon: {
        quarterstaff: {
          primary: "quarterstaff",
        },
        dagger: {
          primary: "dagger",
        },
      },
    },
    defaults: {
      mainHand: "primary",
      offHand: null,
      armor: null,
      grip: "one",
    },
    id: "tidecaller",
    version: 1,
  },
  warden: {
    guaranteed: {
      backup: "dagger",
    },
    choices: {
      weapon: {
        "longsword-shield": {
          primary: "longsword",
          shield: "shield",
        },
        "warhammer-shield": {
          primary: "warhammer",
          shield: "shield",
        },
        greatsword: {
          primary: "greatsword",
        },
      },
      armor: {
        "chain-mail": {
          armor: "chain-mail",
        },
        "chain-shirt": {
          armor: "chain-shirt",
        },
      },
    },
    defaults: {
      mainHand: "primary",
      offHand: "shield:if-present",
      armor: "armor",
      grip: "one",
    },
    id: "warden",
    version: 1,
  },
  reaver: {
    guaranteed: {
      backup: "dagger",
      armor: "leather-armor",
    },
    choices: {
      weapon: {
        handaxe: {
          primary: "handaxe",
        },
        spear: {
          primary: "spear",
        },
        greatclub: {
          primary: "greatclub",
        },
      },
    },
    defaults: {
      mainHand: "primary",
      offHand: null,
      armor: "armor",
      grip: "one",
    },
    id: "reaver",
    version: 1,
  },
};
