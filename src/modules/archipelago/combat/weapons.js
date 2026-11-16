module.exports = Object.fromEntries(
  require("@crossworld/sanguine-engine/equipment/weapons").map((d) => [d.id, d])
);
