const router = require("express").Router();
router.get('/character-rules',(req,res,next)=>{
  const registry=require('./rules2024').blueprint;
  if(req.query.version!==undefined&&req.query.version!==registry.rulesVersion)return next(Object.assign(new Error('Unsupported character rules version'),{statusCode:409}));
  res.set('ETag','"'+registry.contentHash+'"');
  res.send(registry);
});
router.get("/capabilities", (_req, res) => res.send({ playtestEnabled: false }));
router.get("/blueprint", (_req, res) => res.send({
  ...require("./rules2024").blueprint,
  catalogs: {
    origins: require("./blueprints/characters/origins"),
    originPaths: require("./blueprints/characters/originPaths"),
    reputation: require("./blueprints/world/reputation"),
  },
}));
router.get("/rules-2024", (_req, res) => res.send(require("./rules2024").blueprint));
router.post("/rules-2024/preview", (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => key !== "ledger"))
      throw Object.assign(new Error("Preview accepts only a rules ledger"), { statusCode: 400 });
    res.send(require("./rules2024").replay(body.ledger));
  } catch (error) { error.statusCode ??= 400; next(error); }
});
module.exports = router;
