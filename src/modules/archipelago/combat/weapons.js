module.exports = Object.fromEntries(
  require("../system/blueprints/equipment/weapons").map((d) => [d.id, d])
);
