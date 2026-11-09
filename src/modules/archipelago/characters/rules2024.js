// Persistent SRD characters share the existing owner-protected character collection.
// All mechanical state is replayed from server-validated, append-only level events.
const rules = require("../system/rules2024");
function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}
function fields(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) fail("Invalid character fields");
}
function text(value, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max)
    fail("Invalid character text");
  return value.trim();
}
function decorate(value) {
  const c = {...(value.toObject ? value.toObject() : value)};
  delete c.creationRequest;
  if(!Number.isSafeInteger(c.goldCp)||c.goldCp<0)fail('Recreate this experimental character using integer-copper storage',409);
  const baseSummary = rules.replay(c.rulesLedger);
  const summary = rules.runtime.project(baseSummary, c.rulesRuntime,c);
  const rebuildReview=c.rulesRuntime.rebuildProposal?{summary:rules.replay(c.rulesRuntime.rebuildProposal.ledger),consequences:c.rulesRuntime.rebuildProposal.consequences}:null;
  rules.runtime.validate(baseSummary, c.rulesRuntime);
  for (const [id, prepared] of Object.entries(c.rulesRuntime.preparations))
    summary.spellcasting[id].prepared = [...prepared];
  return { ...c, rulesSummary: summary,rebuildReview,
    permissions:require('./authority').permissions(c,{isOwner:true,gmAllowed:!c.campaignId,campaignRegistered:false,role:c.campaignId?'owner':'solo-owner'}),
    calling: c.rulesLedger.levels[0].callingId,
    attributes: summary.attributes,
    progression: { rank: summary.totalLevel },
    resources: { health: c.rulesRuntime.health },
    equipment: require("../equipment").derive({ ...c, attributes: summary.attributes,
      progression: { rank: summary.totalLevel } }),
  };
}
function build(body) {
  fields(body, [...require('./identity').fields, "origin", "attributes", "firstLevel", 'creation','purchases']);
  const identity=require('./identity').validate(body);
  if (!body.creation) fail('Complete origin, background and point-buy creation choices',422);
  const { ledger, summary } = rules.create(body.attributes, body.firstLevel, { creation: body.creation });
  const starting = require('./creationEquipment').build(ledger,body.purchases);
  return {
    name: text(body.name, 2, 80), origin: summary.originId,
    schemaVersion:1,rulesVersion:'SA-CHAR-1',
    notes: body.notes === undefined ? "" : text(body.notes, 0, 5000),
    portraitUrl:identity.portraitUrl??'',pronouns:identity.pronouns??'',appearance:identity.appearance??'',
    calling: ledger.levels[0].callingId,
    attributes: summary.attributes,
    rulesLedger: ledger, rulesRuntime: rules.runtime.initialize(summary),
    documentRevision: 0,
    ...starting,
  };
}
// Preserve expenditure when maxima change; advancement never acts as a free rest.
function reconcile(previous, before, after) {
  const next = rules.runtime.initialize(after);
  next.revision = previous.revision + 1;
  next.temporaryHealth = previous.temporaryHealth ?? 0;
  next.effects = structuredClone(previous.effects ?? []);
  next.counters = structuredClone(previous.counters ?? {});
  if(previous.externalCastingTurn!==undefined)next.externalCastingTurn=previous.externalCastingTurn;
  for(const key of ['gearUses','prayerRestEpoch','magicDawns','lastMagicDawn','folioUnavailable','folioMemory','folioBookId','folioHistory','spellDiscoveries','milestones','conduitGrants','conduitCircuit','forbiddenSneakEvents','toolChecks','interventionCooldown','strikeHistory','pendingStealthCover','inspirationSource','inspiration','featState','initiative','inCombat','environment','castings','targetLocks','salvageCp','turnCasting','ammunitionActions','restSession','restHistory','lastLongRest','restEpoch','worldTime','ownerTurn','ownerTurnHistory','deathSaves','conditions','exhaustion','concentrationChecks','temporaryHealthMetadata','pendingRelentlessRage'])if(previous[key]!==undefined)next[key]=structuredClone(previous[key]);
  next.folio = [...(previous.folio ?? [])].filter(id => !after.spellcasting.shipwright?.folio.includes(id));
  next.selections = structuredClone(previous.selections ?? {});
  for (const [id, choices] of Object.entries(next.selections)) {
    for (const key of ['cantrips', 'mastery']) {
      if (!choices[key]) continue;
      const grants = after.pathSelections[id]?.[key] ?? [];
      choices[key] = [...new Set([...choices[key], ...grants])].slice(0, grants.length);
    }
  }
  next.health.current = Math.max(0, Math.min(after.health.max,
    previous.health.current + Math.max(0,after.health.max - before.health.max)));
  if(next.health.current>0&&!next.deathSaves?.dead){next.deathSaves=require('../system/rules2024/vitality').fresh();next.pendingRelentlessRage=null;}
  for (const [id, max] of Object.entries(after.resources))
    next.pools[id] = Math.min(max.max,Math.max(0, max.max - ((before.resources[id]?.max ?? 0) - (previous.pools[id] ?? 0))));
  next.slots = after.spellSlots.map((max, i) => Math.max(0,
    max - ((before.spellSlots[i] ?? 0) - (previous.slots[i] ?? 0))));
  next.createdSlots = after.spellSlots.map((_, i) => previous.createdSlots?.[i] ?? 0);
  for (const [die, max] of Object.entries(after.hitDice))
    next.hitDice[die] = Math.max(0, max - ((before.hitDice[die] ?? 0) - (previous.hitDice[die] ?? 0)));
  for (const [id, casting] of Object.entries(after.spellcasting)) {
    const old = previous.preparations[id];
    if (!old) continue;
    // Rest selections are current state, not historical level-event choices.
    const additions = casting.prepared.filter(spell => !before.spellcasting[id]?.prepared.includes(spell));
    next.preparations[id] = [...new Set([...old, ...additions, ...casting.prepared])].filter(spell=>!casting.alwaysPrepared.includes(spell)).slice(0, casting.preparedCount);
  }
  return next;
}
function folioAtSpellGrant(character,summary){
  const state=character.rulesRuntime;
  const level=summary.callingLevels.shipwright;
  if(![17,19].includes(level)||!state.folio?.length&&!state.folioUnavailable?.length)return undefined;
  const current=rules.runtime.project(summary,state);
  return current.spellcasting.shipwright.folio.filter(id=>rules.spellGrantEligible(rules.blueprint.spells.find(s=>s.id===id),level+1));
}
function handlers(Character,Campaign) {
  async function owned(req,gmRead=false) {
    let c = await Character.findOne({ _id: req.params.characterId, owner: req.user._id }).lean();
    if(!c&&gmRead&&Campaign){c=await Character.findOne({_id:req.params.characterId}).lean();if(c&&!(await require('./authority').context(c,req.user._id,Campaign)).gmAllowed)c=null;}
    if (!c) fail("Character not found", 404);
    if (!c.rulesLedger?.creation || c.rulesVersion!=='SA-CHAR-1'||!Number.isSafeInteger(c.goldCp)) fail("Recreate this experimental character using the current creator", 409);
    return c;
  }
  const wrap = action => async (req, res, next) => {
    try { await action(req, res); } catch (e) { next(e); }
  };
  return {
    createPreview: wrap(async (req, res) => {
      fields(req.body,['attributes','firstLevel','creation','purchases']);
      if(!req.body.creation)fail('Choose an origin and background',422);
      const {summary,ledger}=rules.create(req.body.attributes,req.body.firstLevel,{creation:req.body.creation,allowIncomplete:true});
      const equipment=require('./creationEquipment');res.send({...summary,creationEquipment:equipment.display(equipment.build(ledger,req.body.purchases,true))});
    }),
    create: wrap(async (req, res) => {
      const requests=require('./creationRequest'),key=requests.request(req);
      if(key&&Character.init)await Character.init();
      const query=key?{owner:req.user._id,'creationRequest.operationId':key.operationId}:null;
      if(key){const previous=await Character.findOne(query).lean();if(previous)return res.status(201).send(decorate(requests.replay(previous,key)));}
      const payload = build(req.body);
      if (await Character.countDocuments({ owner: req.user._id }) >= 20) fail("Character limit reached", 403);
      if(!key)return res.status(201).send(decorate(await Character.create({ ...payload, owner: req.user._id })));
      const now=new Date(),initialState={...payload,_id:require('node:crypto').randomBytes(12).toString('hex'),owner:req.user._id,createdAt:now,updatedAt:now,status:'active',campaignId:null,presets:[]};
      try{
        await Character.create({...initialState,creationRequest:{...key,initialState}});
        res.status(201).send(decorate(initialState));
      }catch(error){
        if(error.code!==11000)throw error;
        const winner=await Character.findOne(query).lean();if(!winner)throw error;
        res.status(201).send(decorate(requests.replay(winner,key)));
      }
    }),
    get: wrap(async (req, res) => {const c=await owned(req,true),access=await require('./authority').context(c,req.user._id,Campaign);res.send({...decorate(c),permissions:require('./authority').permissions(c,access)});}),
    preview: wrap(async (req, res) => {
      const c = await owned(req);
      fields(req.body, ["callingId", "choices", "healthRoll"]);
      // The client can propose only the next event, never replace saved history.
      const ledger = structuredClone(c.rulesLedger);
      const folio=folioAtSpellGrant(c,rules.replay(ledger));
      ledger.levels.push(folio===undefined?req.body:{...req.body,folioAtSpellGrant:folio});
      res.send(rules.replay(ledger));
    }),
  };
}
module.exports = { build, decorate, reconcile, folioAtSpellGrant, handlers };
