const router = require("express").Router();

const authRoutes = require("../modules/auth/routes");
const achievementRoutes = require("../modules/achievements/routes");
const userRoutes = require("../modules/users/routes");
const archipelagoRoutes = require("../modules/archipelago/routes");
const wtwrRoutes = require("../modules/wtwr/routes");
const squashRoutes = require("../modules/squash/routes");
const paleshelterRoutes = require("../modules/paleshelter/routes");

const NotFoundError = require("../core/errors/not-found-error");

router.use("/auth", authRoutes);
router.use("/achievements", achievementRoutes);
router.use("/users", userRoutes);
router.use("/archipelago", archipelagoRoutes);
router.use("/wtwr", wtwrRoutes);
router.use("/squash", squashRoutes);
router.use("/paleshelter", paleshelterRoutes);

router.use((req, res, next) => {
  next(new NotFoundError("Route not found"));
});

module.exports = router;
