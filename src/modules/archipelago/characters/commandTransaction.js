const {
  grantTemporaryHealth,
} = require('@crossworld/sanguine-engine/vitality');
const rules = require('../system/characterSystem');
const { fail, validateEnvelope } = require('./commandEnvelope');
function bindTransaction(apply, Character, Receipt, Treatment, Campaign) {
  return async (req, res, next) => {
    let session;
    try {
      const digest = validateEnvelope(req.body);
      if (Treatment) await Treatment.init();
      session = await Character.db.startSession();
      let response;
      await session.withTransaction(async () => {
        let c = await Character.findOne({
          _id: req.params.characterId,
          owner: req.user._id,
        })
          .session(session)
          .lean();
        if (!c && require('./authority').gmCommands.includes(req.body.type))
          c = await Character.findOne({ _id: req.params.characterId })
            .session(session)
            .lean();
        if (!c) fail('Character not found', 404);
        const authorization = await require('./authority').context(
          c,
          req.user._id,
          Campaign,
          session,
        );
        if (!authorization.isOwner && !authorization.gmAllowed)
          fail('Character not found', 404);
        if (
          require('./authority').gmCommands.includes(req.body.type) &&
          !authorization.gmAllowed
        )
          fail('This operation requires the campaign GM', 403);
        const key = {
          characterId: req.params.characterId,
          owner: c.owner,
          operationId: req.body.operationId,
        };
        const previous = await Receipt.findOne(key).session(session).lean();
        if (previous) {
          if (previous.digest !== digest)
            fail('operationId was already used for a different command', 409, {
              code: 'operation_conflict',
              fieldPath: 'operationId',
            });
          response = previous.response;
          return;
        }
        if (c.rulesVersion !== 'SA-CHAR-1' || !c.rulesLedger?.creation)
          fail(
            'Recreate this experimental character using the current creator',
            409,
          );
        const payload = structuredClone(req.body.payload);
        const context = { ...authorization };
        if (
          req.body.type === 'ability.activate' &&
          payload.optionId === 'path:sanguine-conduit:vital-circuit:14#circuit'
        ) {
          const params = payload.parameters ?? {};
          if (
            typeof params.eventId !== 'string' ||
            typeof params.targetId !== 'string' ||
            typeof payload.turnId !== 'string'
          )
            fail('Vital Circuit needs a damage event, source target and turn');
          const prior = await Receipt.findOne({
            characterId: c._id,
            owner: req.user._id,
            $or: [
              {
                'response.operationResult.conduitCircuit.turnId':
                  payload.turnId,
              },
              {
                'response.operationResult.conduitCircuit.eventId':
                  params.eventId,
                'response.operationResult.conduitCircuit.targetId':
                  params.targetId,
              },
            ],
          })
            .session(session)
            .lean();
          if (prior)
            fail('Vital Circuit already resolved this damage event or turn');
          if (!/^[a-f0-9]{24}$/i.test(params.targetId)) {
            if (
              typeof params.objectId !== 'string' ||
              !params.objectId.trim() ||
              params.objectId.length > 100
            )
              fail('Identify your Blood Price grant');
            const grant = await Receipt.findOne({
              characterId: c._id,
              owner: req.user._id,
              'response.operationResult.temporaryHealthGrant.metadata.grantId':
                params.objectId,
            })
              .session(session)
              .lean();
            context.bloodPriceGrant =
              grant?.response?.operationResult?.temporaryHealthGrant;
          }
        }
        if (
          req.body.type === 'ability.activate' &&
          payload.optionId ===
            'path:sanguine-conduit:vital-circuit:14#circuit' &&
          /^[a-f0-9]{24}$/i.test(payload.parameters?.targetId ?? '')
        ) {
          const permission = c.campaignId
            ? { $or: [{ owner: req.user._id }, { campaignId: c.campaignId }] }
            : { owner: req.user._id };
          const target = await Character.findOne({
            _id: payload.parameters.targetId,
            ...permission,
          })
            .session(session)
            .lean();
          if (!target)
            fail('Vital Circuit source target is not authorized', 404);
          const event = await Receipt.findOne({
            characterId: target._id,
            owner: target.owner,
            operationId: payload.parameters.eventId,
          })
            .session(session)
            .lean();
          if (event?.response?.operationResult?.type !== 'health.damage')
            fail(
              'Choose a saved damage command that reduced Blood Price temporary Health',
            );
          context.bloodPriceLoss =
            event.response.operationResult.bloodPriceLoss;
        }
        const triage =
          req.body.type === 'ability.activate' &&
          [
            'path:field-surgeon:clinical-doctrine:3#triage',
            'path:field-surgeon:battlefield-procedure:6#toxicology',
          ].includes(payload.optionId);
        if (triage && Treatment) {
          const target = payload.targetIds?.[0];
          let restEpoch = payload.parameters?.targetRestEpoch;
          if (typeof target === 'string' && /^[a-f0-9]{24}$/i.test(target)) {
            const permission = c.campaignId
              ? { $or: [{ owner: req.user._id }, { campaignId: c.campaignId }] }
              : { owner: req.user._id };
            const native = await Character.findOne({
              _id: target,
              ...permission,
            })
              .session(session)
              .lean();
            if (!native) fail('Target is not an authorized character', 404);
            restEpoch = native.rulesRuntime.restEpoch ?? 'creation';
            payload.parameters = {
              ...payload.parameters,
              targetRestEpoch: restEpoch,
            };
          }
          if (
            typeof target !== 'string' ||
            typeof restEpoch !== 'string' ||
            !restEpoch.trim() ||
            restEpoch.length > 100
          )
            fail('Triage needs one stable target and a completed-rest label');
          const lock = {
            scope: c.campaignId
              ? 'campaign:' + c.campaignId
              : 'owner:' + c.owner,
            target,
            restEpoch,
          };
          if (await Treatment.findOne(lock).session(session).lean())
            fail('Target already received Triage since its last rest');
          await Treatment.create(
            [
              {
                ...lock,
                sourceCharacterId: c._id,
                operationId: req.body.operationId,
              },
            ],
            { session },
          );
        }
        const { changes, result } = apply(c, { ...req.body, payload }, context);
        if (result.inspirationTransfer) {
          if (!authorization.campaignRegistered || !Campaign)
            fail('Inspiration transfer requires a registered party character', 403);
          const campaign = await Campaign.findOne({
            _id: c.campaignId, characterIds: result.inspirationTransfer.targetId,
          }).session(session).lean();
          if (!campaign) fail('Inspiration recipient is outside your party', 404);
          const target = await Character.findOne({
            _id: result.inspirationTransfer.targetId,
            campaignId: c.campaignId,
          }).session(session).lean();
          if (!target) fail('Inspiration recipient is outside your campaign', 404);
          const after = structuredClone(target.rulesRuntime);
          if (after.inspiration || after.deathSaves?.dead)
            fail('The recipient must be living and have no Inspiration');
          after.inspiration = true;
          after.inspirationSource = {
            source: 'lineage:human:inspiration',
            characterId: String(c._id),
          };
          after.revision++;
          rules.runtime.validate(rules.replay(target.rulesLedger), after);
          const saved = await Character.findOneAndUpdate(
            { _id: target._id, documentRevision: target.documentRevision },
            { $set: { rulesRuntime: after, documentRevision: target.documentRevision + 1 } },
            { new: true, runValidators: true, session },
          ).lean();
          if (!saved) fail('Inspiration recipient changed; reload before completing the rest', 409);
        }
        if (result.swap && /^[a-f0-9]{24}$/i.test(result.swap.targetId)) {
          if (result.swap.targetId === String(c._id))
            fail('Alert needs another creature');
          const permission = c.campaignId
            ? { $or: [{ owner: req.user._id }, { campaignId: c.campaignId }] }
            : { owner: req.user._id };
          const target = await Character.findOne({
            _id: result.swap.targetId,
            ...permission,
          })
            .session(session)
            .lean();
          if (!target)
            fail('Initiative ally is not an authorized character', 404);
          const after = structuredClone(target.rulesRuntime);
          if (
            require('../combat/vitality/vitality').incapacitated(after) ||
            after.initiative?.combatId !== result.swap.combatId ||
            after.initiative.total !== result.swap.ownerReceives
          )
            fail(
              'Ally must be conscious in the same combat with the matching saved Initiative',
            );
          after.initiative.total = result.swap.allyReceives;
          after.revision++;
          const savedTarget = await Character.findOneAndUpdate(
            { _id: target._id, documentRevision: target.documentRevision },
            {
              $set: {
                rulesRuntime: after,
                documentRevision: target.documentRevision + 1,
              },
            },
            { new: true, runValidators: true, session },
          ).lean();
          if (!savedTarget)
            fail('Initiative ally changed; reload before swapping', 409);
        }
        if (
          [
            'ability.activate',
            'feat.use',
            'equipment.utilize',
            'spell.heal',
          ].includes(req.body.type) &&
          (result.saveAdvantageEffect ||
            result.healing > 0 ||
            result.healingAllocations ||
            result.restoreAllHealth ||
            result.temporaryHealthGrant ||
            result.restoresHealthTo !== undefined ||
            result.stabilize ||
            result.endsCondition ||
            result.endsConditions)
        ) {
          for (const targetId of payload.targetIds ?? []) {
            if (targetId === String(c._id) || !/^[a-f0-9]{24}$/i.test(targetId))
              continue;
            const permission = c.campaignId
              ? { $or: [{ owner: req.user._id }, { campaignId: c.campaignId }] }
              : { owner: req.user._id };
            const target = await Character.findOne({
              _id: targetId,
              ...permission,
            })
              .session(session)
              .lean();
            if (!target) fail('Target is not an authorized character', 404);
            const after = structuredClone(target.rulesRuntime);
            require('../combat/effects/healingEffects').targetEffects(
              after,
              result.healingAllocations
                ? {
                    ...result,
                    healing:
                      result.healingAllocations.find(
                        (a) => a.targetId === targetId,
                      )?.amount ?? 0,
                  }
                : result,
              rules.replay(target.rulesLedger),
            );
            if (result.temporaryHealthGrant?.targetIds.includes(targetId)) {
              const { amount, metadata } = result.temporaryHealthGrant;
              Object.assign(
                after,
                grantTemporaryHealth(
                  after.temporaryHealth,
                  amount,
                  metadata ?? { source: result.optionId },
                ),
              );
            }
            after.revision++;
            rules.runtime.validate(rules.replay(target.rulesLedger), after);
            const savedTarget = await Character.findOneAndUpdate(
              { _id: target._id, documentRevision: target.documentRevision },
              {
                $set: {
                  rulesRuntime: after,
                  documentRevision: target.documentRevision + 1,
                },
              },
              { new: true, runValidators: true, session },
            ).lean();
            if (!savedTarget) fail('Target changed; retry healing', 409);
          }
        }
        const saved = await Character.findOneAndUpdate(
          { _id: c._id, owner: c.owner, documentRevision: c.documentRevision },
          { $set: changes },
          { new: true, runValidators: true, session },
        ).lean();
        if (!saved) fail('Character changed; reload before saving', 409);
        response = {
          ...require('./persistence').decorate(saved),
          permissions: require('./authority').permissions(saved, authorization),
          operationResult: result,
        };
        await Receipt.create(
          [
            {
              ...key,
              actor: req.user._id,
              actorRole: authorization.role,
              digest,
              response,
            },
          ],
          { session },
        );
      });
      res.send(response);
    } catch (error) {
      const failure =
        error.code === 11000 && error.keyPattern?.restEpoch
          ? Object.assign(
              new Error('Target already received Triage since its last rest'),
              { statusCode: 422 },
            )
          : error;
      next(failure);
    } finally {
      if (session) await session.endSession();
    }
  };
}
module.exports = bindTransaction;
