const items = [
  ...require("./weapons"),
  ...require("./armor"),
  ...require("./shields"),
];
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
module.exports = freeze({ version: 1, items });
