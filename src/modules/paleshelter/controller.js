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

const getPlayCounts = (req, res, next) => {
  Play.aggregate([
    {
      $group: {
        _id: "$trackId",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        trackId: "$_id",
        count: 1,
      },
    },
    {
      $sort: { count: -1 },
    },
  ])
    .then((counts) => res.send(counts))
    .catch(next);
};

module.exports = {
  createPlay,
  getPlayCounts,
};
