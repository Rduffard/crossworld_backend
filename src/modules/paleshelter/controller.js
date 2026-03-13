const Play = require("./model");

const createPlay = (req, res, next) => {
  const { trackId } = req.body;

  Play.create({ trackId })
    .then((play) => {
      res.status(201).send({
        message: "Play tracked",
        play,
      });
    })
    .catch(next);
};

module.exports = { createPlay };
