const router = require("express").Router();
const userRouter = require("./users");
const clothingItem = require("./clothingitems");

router.use("/users", userRouter);
router.use("/items", clothingItem);

router.use((req, res) => {
  res.status(500).send({ message: "Router Not Found" });
});

module.exports = router;
