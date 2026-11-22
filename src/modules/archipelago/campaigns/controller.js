const { randomBytes } = require('node:crypto');

function fail(message, statusCode = 422) {
  throw Object.assign(new Error(message), { statusCode });
}

function member(userId) {
  return { $or: [{ owner: userId }, { players: userId }] };
}

function summary(campaign, userId) {
  const canGM = String(campaign.owner) === String(userId);
  return {
    _id: campaign._id, name: campaign.name, description: campaign.description,
    status: campaign.status, canGM, playerCount: campaign.players?.length ?? 0,
    maxPlayers: campaign.maxPlayers, startingLevel: campaign.startingLevel,
    requireAdmissionApproval: Boolean(campaign.requireAdmissionApproval), ...(canGM ? { inviteCode: campaign.inviteCode } : {}),
  };
}

function handlers(Campaign, Character) {
  return {
    async list(req, res) {
      const campaigns = await Campaign.find(member(req.user._id)).sort({ name: 1, _id: 1 }).lean();
      res.send(campaigns.map(campaign => summary(campaign, req.user._id)));
    },
    async create(req, res) {
      const body = req.body ?? {};
      if (Object.keys(body).some(key => !['name', 'description', 'startingLevel', 'requireAdmissionApproval'].includes(key))) fail('Invalid campaign settings');
      const { name, description = '', startingLevel, requireAdmissionApproval = false } = body;
      if (startingLevel !== undefined && (!Number.isInteger(startingLevel) || startingLevel < 1 || startingLevel > 20))
        fail('Choose a starting level from 1 to 20');
      if (typeof requireAdmissionApproval !== 'boolean') fail('Invalid admission approval setting');
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) fail('Enter a campaign name of 2 to 100 characters');
      if (typeof description !== 'string' || description.trim().length > 2000) fail('Campaign descriptions allow up to 2000 characters');
      await Campaign.init();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const campaign = await Campaign.create({ owner: req.user._id, name: name.trim(), description: description.trim(), startingLevel, requireAdmissionApproval, inviteCode: randomBytes(6).toString('hex').toUpperCase() });
          return res.status(201).send(summary(campaign, req.user._id));
        } catch (error) {
          if (error.code !== 11000 || !error.keyPattern?.inviteCode) throw error;
        }
      }
      fail('Could not generate an unused invite code. Retry campaign creation.', 409);
    },
    async join(req, res) {
      const { inviteCode } = req.body ?? {};
      if (Object.keys(req.body ?? {}).some(key => key !== 'inviteCode') || typeof inviteCode !== 'string' || inviteCode.trim().length < 4 || inviteCode.trim().length > 12) fail('Enter the campaign invite code');
      const userId = req.user._id, code = inviteCode.trim().toUpperCase();
      const invited = await Campaign.findOne({ inviteCode: code, status: 'active' }).lean();
      if (!invited) fail('Active campaign not found for this invite code', 404);
      if ([invited.owner, ...(invited.players ?? [])].some(id => String(id) === String(userId))) return res.send(summary(invited, userId));
      const joined = await Campaign.findOneAndUpdate({
        _id: invited._id, status: 'active',
        $expr: { $lt: [{ $size: { $ifNull: ['$players', []] } }, '$maxPlayers'] },
      }, { $addToSet: { players: userId } }, { new: true }).lean();
      if (joined) return res.send(summary(joined, userId));
      const alreadyJoined = await Campaign.findOne({ _id: invited._id, status: 'active', ...member(userId) }).lean();
      if (alreadyJoined) return res.send(summary(alreadyJoined, userId));
      fail('This campaign has no open player seats', 409);
    },
    async open(req, res) {
      const userId = req.user._id;
      const campaign = await Campaign.findOne({ _id: req.params.campaignId, ...member(userId) }).lean();
      if (!campaign) fail('Campaign not found', 404);
      const details = summary(campaign, userId);
      const characters = await Character.find({
        _id: { $in: campaign.characterIds ?? [] }, campaignId: campaign._id,
        ...(details.canGM ? {} : { owner: userId }),
      }).select('_id name calling campaignAdmission').sort({ name: 1, _id: 1 }).lean();
      const admissions = characters.filter(character => character.campaignAdmission &&
        character.campaignAdmission.state !== 'active');
      const active = characters.filter(character => !character.campaignAdmission ||
        character.campaignAdmission.state === 'active');
      res.send({ ...details, characters: active.map(({ _id, name, calling }) => ({ _id, name, calling })), admissions });
    },
    async register(req, res) {
      const { campaignId, characterId } = req.params;
      const userId = req.user._id;
      const request = req.body ?? {};
      const { expectedSourceRevision, adaptStartingLevel } = request;
      if (Object.keys(request).some(key => !['expectedSourceRevision','adaptStartingLevel'].includes(key)) ||
          (expectedSourceRevision !== undefined && (!Number.isInteger(expectedSourceRevision) || expectedSourceRevision < 0)) ||
          (adaptStartingLevel !== undefined && typeof adaptStartingLevel !== 'boolean'))
        fail('Invalid campaign character selection');
      const session = await Character.db.startSession();
      let enrolledId;
      let admissionState = 'active';
      try {
        await session.withTransaction(async () => {
          const campaign = await Campaign.findOne({ _id: campaignId, ...member(userId) }).session(session).lean();
          if (!campaign) fail('Campaign not found', 404);
          if (campaign.status !== 'active') fail('Only active campaigns accept characters', 409);
          const character = await Character.findOne({ _id: characterId, owner: userId }).session(session).lean();
          if (!character) fail('Character not found', 404);
          if (character.rulesVersion !== 'SA-CHAR-1' || character.status !== 'active') fail('Choose an active character using the current rules', 409);
          if (character.campaignId) {
            if (String(character.campaignId) !== String(campaign._id) ||
                !campaign.characterIds?.some(id => String(id) === String(character._id)))
              fail('Choose a personal character as the source', 409);
            enrolledId = character._id;
            admissionState = character.campaignAdmission?.state ?? 'active';
            return;
          }

          const existing = await Character.findOne({
            campaignId: campaign._id, sourceCharacterId: character._id, owner: userId,
            _id: { $in: campaign.characterIds ?? [] },
            'campaignAdmission.state': { $nin: ['rejected'] },
          }).session(session).lean();
          if (existing) {
            enrolledId = existing._id;
            admissionState = existing.campaignAdmission?.state ?? 'active';
            return;
          }

          if (expectedSourceRevision !== undefined && expectedSourceRevision !== character.documentRevision)
            fail('The personal character changed. Review your selection and try again.', 409);
          const rules = require('../system/characterSystem');
          const rulesLedger = structuredClone(character.rulesLedger);
          const requiredLevel = campaign.startingLevel;
          if (requiredLevel !== undefined && rulesLedger.levels.length !== requiredLevel) {
            if (!adaptStartingLevel || rulesLedger.levels.length < requiredLevel)
              fail('This campaign requires a level ' + requiredLevel + ' character', 422);
            rulesLedger.levels = rulesLedger.levels.slice(0, requiredLevel);
          }
          const summary = rules.replay(rulesLedger);
          const { eligible } = require('../equipment/magic');
          const inventory = structuredClone(character.inventory);
          for (const item of inventory) {
            if (item.attuned && !eligible(item, summary)) item.attuned = false;
          }
          admissionState = campaign.requireAdmissionApproval && String(campaign.owner) !== String(userId)
            ? 'pending' : 'active';
          const [copy] = await Character.create([{
            owner: userId,
            campaignId: campaign._id,
            campaignAdmission: {
              state: admissionState, submittedBy: String(userId), submittedAt: Date.now(),
              sourceRevision: character.documentRevision,
              originalLevel: character.rulesLedger.levels.length, startingLevel: summary.totalLevel,
            },
            sourceCharacterId: character._id,
            schemaVersion: character.schemaVersion,
            rulesVersion: character.rulesVersion,
            name: character.name,
            origin: summary.originId,
            calling: rulesLedger.levels[0].callingId,
            notes: character.notes,
            portraitUrl: character.portraitUrl,
            pronouns: character.pronouns,
            appearance: character.appearance,
            attributes: summary.attributes,
            rulesLedger,
            rulesRuntime: rules.runtime.initialize(summary),
            documentRevision: 0,
            inventory,
            loadout: structuredClone(character.loadout),
            presets: structuredClone(character.presets ?? []),
            goldCp: character.goldCp,
          }], { session });
          enrolledId = copy._id;
          const enrolled = await Campaign.updateOne({
            _id: campaign._id, status: 'active', ...member(userId),
          }, { $addToSet: { characterIds: enrolledId } }, { session });
          if (!enrolled.matchedCount) fail('The campaign changed. Reload before registering the character.', 409);
        });
        res.send({ campaignId, characterId: enrolledId, admissionState });
      } finally {
        await session.endSession();
      }
    },
    async decideAdmission(req, res) {
      const { campaignId, characterId } = req.params;
      const { decision, reason } = req.body ?? {};
      if (!['approve', 'reject'].includes(decision) || typeof reason !== 'string' ||
          !reason.trim() || reason.length > 500)
        fail('Choose approve or reject and enter a reason up to 500 characters');
      const campaign = await Campaign.findOne({
        _id: campaignId, owner: req.user._id, status: 'active', characterIds: characterId,
      }).lean();
      if (!campaign) fail('Pending campaign admission not found', 404);
      const state = decision === 'approve' ? 'active' : 'rejected';
      const updated = await Character.findOneAndUpdate({
        _id: characterId, campaignId, 'campaignAdmission.state': 'pending', documentRevision: 0,
      }, {
        $set: {
          'campaignAdmission.state': state,
          'campaignAdmission.decidedBy': String(req.user._id),
          'campaignAdmission.decidedAt': Date.now(),
          'campaignAdmission.reason': reason.trim(),
        },
        $inc: { documentRevision: 1 },
      }, { new: true, runValidators: true }).lean();
      if (!updated) fail('Admission changed before the decision could be saved', 409);
      res.send({ campaignId, characterId: updated._id, admission: updated.campaignAdmission });
    },
  };
}

module.exports = { handlers };
