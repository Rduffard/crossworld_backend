const router = require("express").Router();

const authRoutes = require("../modules/auth/routes");
const wtwrRoutes = require("../modules/wtwr/routes");

const NotFoundError = require("../errors/not-found-error");

router.use("/auth", authRoutes);
router.use("/wtwr", wtwrRoutes);

router.use((req, res, next) => {
  next(new NotFoundError("Route not found"));
});

module.exports = router;
