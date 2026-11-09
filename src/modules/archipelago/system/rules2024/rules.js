// SA-CHAR-1: one immutable, vendored rules contract.
const data = require("./canonicalRules.json");
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
module.exports = freeze(data);
