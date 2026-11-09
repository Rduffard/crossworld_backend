// Character-state operations only; targets, positioning and encounter outcomes remain GM adjudicated.
function fail(message) { throw Object.assign(new Error(message), { statusCode: 400 }); }
function spend(state, id, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(state.pools[id]) || state.pools[id] < amount)
    fail('Insufficient feature resource: ' + id);
  state.pools[id] -= amount;
}
function apply(summary, state, op) {
  const allowed = ['expectedRevision', 'type', 'featureId', 'note', 'poolId', 'slotLevel', 'value'];
  if (Object.keys(op).some(k => !allowed.includes(k))) fail('Invalid feature operation fields');
  state.effects ??= [];
  state.counters ??= {};
  state.temporaryHealth ??= 0;
  if (op.type === 'use-feature') {
    const feature = summary.features.find(f => f.id === op.featureId);
    if (!feature?.action) fail('Unavailable feature action');
    if (typeof (op.note ?? '') !== 'string' || (op.note ?? '').length > 500) fail('Invalid effect note');
    for (const cost of feature.action.costs) spend(state, cost.poolId, cost.amount);
    if (feature.ownerId === 'sanguine-conduit' && feature.callingLevel === 3) {
      const loss = 2 * summary.trainingBonus;
      if (state.health.current <= loss) fail('Blood Price must leave at least one Health');
      state.health.current -= loss;
    }
    if (feature.ownerId === 'sanguine-conduit' && feature.callingLevel === 6) {
      if (state.health.current <= 6) fail('Sacrifice must leave at least one Health');
      state.health.current -= 6;
      state.pools['tidecaller:sorcery-points'] = Math.min(summary.resources['tidecaller:sorcery-points'].max,
        state.pools['tidecaller:sorcery-points'] + 2);
    }
    state.effects.push({ featureId: feature.id, note: op.note ?? '', name: feature.name });
    if (state.effects.length > 100) state.effects.shift();
  } else if (op.type === 'end-effect') {
    state.effects = state.effects.filter(e => e.featureId !== op.featureId);
  } else if (op.type === 'temporary-health') {
    if (!Number.isSafeInteger(op.value) || op.value < 0 || op.value > 10000) fail('Invalid temporary Health');
    // New temporary Health replaces the previous amount only when larger; zero explicitly clears it.
    state.temporaryHealth = op.value === 0 ? 0 : Math.max(state.temporaryHealth, op.value);
  } else if (op.type === 'restore-feature') {
    const restorations = {
      'omen-diver:wings': ['tidecaller:sorcery-points', 3],
      'tidecaller:innate-sorcery': ['tidecaller:sorcery-points', 2],
      'bloodwake:presence': ['reaver:rage', 1],
    };
    if (!summary.resources[op.poolId] || state.pools[op.poolId] !== 0) fail('Feature must be exhausted');
    if (op.poolId === 'tidecaller:innate-sorcery' && summary.callingLevels.tidecaller < 7) fail('Sorcery Incarnate required');
    if (restorations[op.poolId]) spend(state, ...restorations[op.poolId]);
    else {
      const eligible = ['leviathan-anchor:nimbus', 'oath-of-the-free-port:open-harbor', 'iron-covenant:standard', 'lantern-vigil:dawn'];
      if (!eligible.includes(op.poolId) || op.slotLevel !== 5 || !state.slots[4]) fail('Level five slot required');
      if(op.poolId!=='leviathan-anchor:nimbus'){
        if(require('./vitality').incapacitated(state))fail('Cannot use a Bonus Action to restore this feature while Incapacitated');
        require('./featOperations').action(state);
      }
      state.slots[4]--;
      if (state.createdSlots[4] > 0) state.createdSlots[4]--;
    }
    state.pools[op.poolId] = 1;
  } else if (op.type === 'initiative-recovery') {
    const pairs = {
      'reaver:rage': ['reaver:persistent-reserve', 'all'],
      'storm-broker:squall': ['storm-broker:eye-reserve', 1],
      'reef-colossus:colossus': ['reef-colossus:colossus-reserve', 1],
    };
    const pair = pairs[op.poolId];
    if (!pair || !summary.resources[pair[0]]) fail('Unavailable initiative recovery');
    if (pair[1] !== 'all' && state.pools[op.poolId] !== 0) fail('Pool must be empty');
    spend(state, pair[0], 1);
    state.pools[op.poolId] = pair[1] === 'all' ? summary.resources[op.poolId].max : 1;
  } else if (op.type === 'relentless-rage') {
    if (summary.callingLevels.reaver < 11 || !state.pendingRelentlessRage||state.health.current!==0||state.deathSaves?.dead||!state.effects.some(e => e.featureId === 'calling:reaver:rage:1'&&require('./clock').active(state,e)))
      fail('Relentless Rage requires Reaver eleven and active Rage confirmed at the table');
    const dc = 10 + 5 * (state.counters.relentlessRage ?? 0);
    if (!Number.isSafeInteger(op.value) || op.value < -100 || op.value>200) fail('Record the Resolve save total');
    state.counters.relentlessRage = (state.counters.relentlessRage ?? 0) + 1;
    if(op.value>=dc)require('./vitality').revive(state,2*summary.callingLevels.reaver);
    else state.effects=state.effects.filter(e=>e.featureId!=='calling:reaver:rage:1');
    state.pendingRelentlessRage=null;
  } else if (op.type === 'overchannel') {
    if (summary.paths.shipwright !== 'powder-saint' || summary.callingLevels.shipwright < 14) fail('Overchannel unavailable');
    state.counters.overchannel = (state.counters.overchannel ?? 0) + 1;
  } else fail('Unknown feature operation');
}
module.exports = { apply };
