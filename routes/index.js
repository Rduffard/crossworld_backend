const router = require("express").Router();

const userRouter = require("./users");
const clothingItemRouter = require("./clothingitems");

const { createUser, login } = require("../controllers/users");
const { getItems } = require("../controllers/clothingitems");

const auth = require("../middlewares/auth");

const {
  validateUserBody,
  validateLogin,
} = require("../middlewares/validation");

const NotFoundError = require("../errors/not-found-error"); // adjust to your project

// Public routes
router.post("/signup", validateUserBody, createUser);
router.post("/signin", validateLogin, login);
router.get("/items", getItems);

// Protected routes
router.use(auth);

router.use("/users", userRouter);
router.use("/items", clothingItemRouter);

router.use((req, res, next) => {
  next(new NotFoundError("Router Not Found"));
});

module.exports = router;
