function usageWindow(window) {
  if (!window || !Number.isFinite(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 1000 ||
      (window.windowDurationMins != null && (!Number.isSafeInteger(window.windowDurationMins) || window.windowDurationMins < 1 || window.windowDurationMins > 527_040)) ||
      (window.resetsAt != null && (!Number.isSafeInteger(window.resetsAt) || window.resetsAt < 0 || window.resetsAt > 10_000_000_000))) return null;
  const { usedPercent, windowDurationMins, resetsAt } = window;
  return { usedPercent, windowDurationMins: windowDurationMins ?? null, resetsAt: resetsAt ?? null };
}

function rateLimitObservation(snapshot, now = Date.now()) {
  const { observedAt, primary, secondary, ordinaryUsageAllowed } = snapshot || {};
  if (!Number.isSafeInteger(observedAt) || observedAt <= 0 || observedAt > now + 300_000) return null;
  const windows = [usageWindow(primary), usageWindow(secondary)];
  if (windows.every((window) => !window)) return null;
  return {
    observedAt, primary: windows[0], secondary: windows[1],
    ...(typeof ordinaryUsageAllowed === "boolean" ? { ordinaryUsageAllowed } : {}),
  };
}

function usageHoldUntil(snapshot, now = Date.now()) {
  const expiresAt = (snapshot?.observedAt || 0) + 600_000;
  if (snapshot?.ordinaryUsageAllowed === true || expiresAt <= now) return 0;
  return [snapshot?.primary, snapshot?.secondary].reduce((hold, window) => {
    const resetsAt = window?.resetsAt * 1000;
    return window?.usedPercent >= 100 && resetsAt > now ? Math.max(hold, Math.min(resetsAt, expiresAt)) : hold;
  }, 0);
}

module.exports = { rateLimitObservation, usageHoldUntil };
