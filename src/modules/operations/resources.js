const percent = (value) => Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;

function capacity(value) {
  if (!Number.isSafeInteger(value?.total) || value.total <= 0 ||
      !Number.isSafeInteger(value.free) || value.free < 0 || value.free > value.total) return null;
  return { total: value.total, free: value.free };
}

function resourceObservation(source, now) {
  if (!Number.isSafeInteger(source?.observedAt) || source.observedAt > now + 30000 || source.observedAt < now - 120000) {
    return null;
  }
  return {
    observedAt: source.observedAt, cpu: percent(source.cpu), memory: capacity(source.memory),
    drives: { C: capacity(source.drives?.C), D: capacity(source.drives?.D) },
  };
}

module.exports = { resourceObservation };
