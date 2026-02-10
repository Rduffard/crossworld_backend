const router = require("express").Router();

const authRoutes = require("../modules/auth/routes");
const wtwrRoutes = require("../modules/wtwr/routes");
const squashRoutes = require("../modules/squash/routes");

const NotFoundError = require("../errors/not-found-error");

router.use("/auth", authRoutes);
router.use("/wtwr", wtwrRoutes);
router.use("/squash", squashRoutes);

router.use((req, res, next) => {
  next(new NotFoundError("Route not found"));
});

module.exports = router;
