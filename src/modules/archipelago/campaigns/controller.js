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
    maxPlayers: campaign.maxPlayers, ...(canGM ? { inviteCode: campaign.inviteCode } : {}),
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
      if (Object.keys(body).some(key => !['name', 'description'].includes(key))) fail('Only name and description can be set at creation');
      const { name, description = '' } = body;
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) fail('Enter a campaign name of 2 to 100 characters');
      if (typeof description !== 'string' || description.trim().length > 2000) fail('Campaign descriptions allow up to 2000 characters');
      await Campaign.init();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const campaign = await Campaign.create({ owner: req.user._id, name: name.trim(), description: description.trim(), inviteCode: randomBytes(6).toString('hex').toUpperCase() });
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
      }).select('_id name calling').sort({ name: 1, _id: 1 }).lean();
      res.send({ ...details, characters });
    },
    async register(req, res) {
      const { campaignId, characterId } = req.params;
      const userId = req.user._id;
      const session = await Character.db.startSession();
      try {
        await session.withTransaction(async () => {
          const campaign = await Campaign.findOne({ _id: campaignId, ...member(userId) }).session(session).lean();
          if (!campaign) fail('Campaign not found', 404);
          if (campaign.status !== 'active') fail('Only active campaigns accept characters', 409);
          const character = await Character.findOne({ _id: characterId, owner: userId }).session(session).lean();
          if (!character) fail('Character not found', 404);
          if (character.rulesVersion !== 'SA-CHAR-1' || character.status !== 'active') fail('Choose an active character using the current rules', 409);
          if (character.campaignId && String(character.campaignId) !== String(campaign._id)) fail('This character already belongs to another campaign', 409);
          if (character.campaignId && campaign.characterIds?.some(id => String(id) === String(character._id))) return;
          if (!character.campaignId) {
            const updated = await Character.updateOne({ _id: character._id, owner: userId, documentRevision: character.documentRevision }, {
              $set: { campaignId: campaign._id, 'rulesRuntime.milestones': (character.rulesRuntime.milestones ?? []).filter(milestone => milestone.used) },
              $unset: { 'rulesRuntime.rebuildProposal': '' },
              $inc: { documentRevision: 1, 'rulesRuntime.revision': 1 },
            }, { session, runValidators: true });
            if (!updated.matchedCount) fail('The character changed. Reload before registering it.', 409);
          }
          const enrolled = await Campaign.updateOne({ _id: campaign._id, status: 'active', ...member(userId) }, { $addToSet: { characterIds: character._id } }, { session });
          if (!enrolled.matchedCount) fail('The campaign changed. Reload before registering the character.', 409);
        });
        res.send({ campaignId, characterId });
      } finally {
        await session.endSession();
      }
    },
  };
}

module.exports = { handlers };
