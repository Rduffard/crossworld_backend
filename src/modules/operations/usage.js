const subscriptionBudget = Object.freeze({
  baselineDate: "2026-11-26", baselinePercent: 43,
  warningPercent: 90, dispatchStopPercent: 95, executionStopPercent: 98,
});

function budgetStatus(snapshot, now = Date.now()) {
  const weekly = [snapshot?.primary, snapshot?.secondary].find(window => window?.windowDurationMins === 10080);
  if (!weekly || (weekly.resetsAt != null && weekly.resetsAt * 1000 <= now)) {
    return { ...subscriptionBudget, state: "unavailable", usedPercent: null };
  }
  const { usedPercent } = weekly;
  const state = usedPercent >= subscriptionBudget.executionStopPercent ? "suspended" :
    usedPercent >= subscriptionBudget.dispatchStopPercent ? "dispatch-stopped" :
      usedPercent >= subscriptionBudget.warningPercent ? "warning" : "normal";
  return { ...subscriptionBudget, state, usedPercent, observedAt: snapshot.observedAt,
    resetsAt: weekly.resetsAt == null ? null : weekly.resetsAt * 1000 };
}

function dispatchStopped(budget) {
  return budget.state === "dispatch-stopped" || budget.state === "suspended";
}

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
  const budget = budgetStatus(snapshot, now);
  if (dispatchStopped(budget)) return budget.resetsAt ?? now + 60_000;
  const expiresAt = (snapshot?.observedAt || 0) + 600_000;
  if (snapshot?.ordinaryUsageAllowed === true || expiresAt <= now) return 0;
  return [snapshot?.primary, snapshot?.secondary].reduce((hold, window) => {
    const resetsAt = window?.resetsAt * 1000;
    return window?.usedPercent >= 100 && resetsAt > now ? Math.max(hold, Math.min(resetsAt, expiresAt)) : hold;
  }, 0);
}

function shouldSampleUsage(previous, current) {
  if (!previous || current.observedAt - previous.observedAt >= 900_000 ||
      budgetStatus(previous, current.observedAt).state !== budgetStatus(current, current.observedAt).state) return true;
  return ["primary", "secondary"].some(key => previous[key]?.resetsAt !== current[key]?.resetsAt ||
    previous[key]?.windowDurationMins !== current[key]?.windowDurationMins);
}

module.exports = { rateLimitObservation, usageHoldUntil, shouldSampleUsage, budgetStatus, dispatchStopped };
