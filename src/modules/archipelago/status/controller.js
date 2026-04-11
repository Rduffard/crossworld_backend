const getStatus = (req, res) => {
  res.send({
    name: "archipelago",
    status: "ok",
    userId: req.user._id,
  });
};

module.exports = {
  getStatus,
};
