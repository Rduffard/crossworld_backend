const { randomUUID } = require('node:crypto');
const { equipmentSlots } = require('@crossworld/sanguine-engine/equipment/loadout-rules');
const { fail } = require('../characters/commandEnvelope');
const { definition, validateLoadout } = require('./inventory');

function take(source, payload) {
  const { targetId, expectedTargetRevision, instanceId, quantity, unequip } = payload;
  if (
    Object.keys(payload).some((key) =>
      !['targetId', 'expectedTargetRevision', 'instanceId', 'quantity', 'unequip'].includes(key),
    ) ||
    typeof targetId !== 'string' || !/^[a-f\d]{24}$/i.test(targetId) ||
    targetId.toLowerCase() === source._id ||
    !Number.isSafeInteger(expectedTargetRevision) ||
    expectedTargetRevision < 0 || expectedTargetRevision >= Number.MAX_SAFE_INTEGER ||
    typeof instanceId !== 'string' || !instanceId ||
    !Number.isSafeInteger(quantity) || quantity < 1 ||
    (unequip !== undefined && typeof unequip !== 'boolean')
  ) fail('Choose a different recipient, its saved revision, and a positive item quantity');

  const item = source.inventory.find((entry) => entry.instanceId === instanceId);
  if (!item || quantity > item.quantity)
    fail('Cannot transfer an absent item or more than its owned quantity');
  if (source.rulesRuntime.effects.some((effect) =>
    effect.poisonCoating?.instanceId === instanceId ||
    effect.oilFuel?.objectId === instanceId ||
    effect.contingency?.statueId === instanceId ||
    (effect.deployedItem && effect.sourceInstanceId === instanceId),
  )) fail('Resolve the item’s active coating, fuel, Contingency, or deployment before transferring it');
  const entireStack = quantity === item.quantity;
  const unequippedSlots = equipmentSlots.filter((slot) => source.loadout[slot] === instanceId);
  if ((unequippedSlots.length || item.worn || item.attuned) && !unequip)
    fail('Confirm removing equipped gear and ending attunement before transferring it');
  if (!entireStack && (
    unequippedSlots.length || item.worn || item.attuned || item.chargesCurrent !== undefined ||
    (item.definitionId && !definition(item.definitionId).stackable)
  )) fail('Only carried stacks without charges may be partially transferred');

  const received = {
    ...item,
    instanceId: entireStack ? instanceId : randomUUID(),
    quantity,
    ...(item.worn !== undefined ? { worn: false } : {}),
    ...(item.attuned !== undefined ? { attuned: false } : {}),
  };
  if (entireStack) {
    source.inventory = source.inventory.filter((entry) => entry !== item);
    for (const slot of unequippedSlots) source.loadout[slot] = null;
    if (unequippedSlots.includes('mainHand')) source.loadout.grip = 'one';
    source.presets = source.presets?.filter((preset) =>
      !equipmentSlots.some((slot) => preset.loadout[slot] === instanceId),
    );
  } else item.quantity -= quantity;
  validateLoadout(source.inventory, source.loadout);

  return {
    type: 'equipment.transfer',
    transfer: {
      sourceId: source._id,
      targetId: targetId.toLowerCase(),
      sourceInstanceId: instanceId,
      targetInstanceId: received.instanceId,
      targetRevision: expectedTargetRevision + 1,
      quantity,
      itemName: received.customName.trim() || definition(received.definitionId).name,
      unequippedSlots,
      endedAttunement: Boolean(item.attuned),
    },
    received,
  };
}

async function receive(source, targetId, expectedRevision, item, context) {
  const { Character, Campaign, authorization, session } = context;
  const campaignId = source.campaignId;
  const target = await Character.findOne({
    _id: targetId,
    ...(campaignId ? { campaignId } : { owner: source.owner, campaignId: null }),
  }).session(session).lean();
  if (!target || (target.campaignAdmission && target.campaignAdmission.state !== 'active'))
    fail('Transfer recipient not found', 404);
  if (campaignId && !(await require('../characters/authority')
    .context(target, authorization.userId, Campaign, session)).gmAllowed)
    fail('Transfer recipient not found', 404);
  if (target.rulesVersion !== 'SA-CHAR-1' || !target.rulesLedger?.creation)
    fail('Recreate the recipient using the current character creator', 409);
  if (expectedRevision !== target.documentRevision)
    fail('Recipient changed; reload before transferring', 409, {
      code: 'revision_conflict',
      fieldPath: 'payload.expectedTargetRevision',
      currentRevision: target.documentRevision,
    });
  if (target.rulesRuntime.animalForms?.activeFormId)
    fail('The recipient must leave animal form before receiving equipment');
  if (target.inventory.some((entry) => entry.instanceId === item.instanceId))
    fail('The recipient already holds this item instance', 409);

  const inventory = [...target.inventory, item];
  validateLoadout(inventory, target.loadout);
  const saved = await Character.findOneAndUpdate(
    { _id: target._id, owner: target.owner, documentRevision: expectedRevision },
    { $set: { inventory, documentRevision: expectedRevision + 1 } },
    { new: true, runValidators: true, session },
  ).lean();
  if (!saved) fail('Recipient changed; reload before transferring', 409);
}

module.exports = { take, receive };
