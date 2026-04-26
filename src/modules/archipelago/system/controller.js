const blueprint = require("./index");

const getBlueprint = (req, res) => {
  res.send(blueprint);
};

module.exports = {
  getBlueprint,
};
