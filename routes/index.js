const router = require("express").Router();

const userRouter = require("./users");
const clothingItemRouter = require("./clothingitems");

const { createUser, login } = require("../controllers/users");
const { getItems } = require("../controllers/clothingitems");

const auth = require("../middlewares/auth");
const { NOT_FOUND } = require("../utils/errors");

// Public routes
router.post("/signup", createUser);
router.post("/signin", login);
router.get("/items", getItems);

// Protected routes
router.use(auth);

router.use("/users", userRouter);
router.use("/items", clothingItemRouter);

router.use((req, res) => {
  res.status(NOT_FOUND).send({ message: "Router Not Found" });
});

module.exports = router;
