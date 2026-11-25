const { preflightChanged } = require("./diagnostics");

const capabilities = [
  "read", "write", "cross-drive", "scratch", "subprocess", "network", "browser", "blender", "isolated-review",
];
const restrictedProfiles = ["read-only", "development", "workshop", "scoped"];
const profiles = [...restrictedProfiles, "full-access"];
const unrestrictedCapabilities = capabilities.filter(value => value !== "isolated-review");
const digest = /^[a-f\d]{64}$/;
const preflightLifetime = 15 * 60_000;

function capabilityList(input) {
  if (!Array.isArray(input) || input.length > capabilities.length ||
      input.some(value => !capabilities.includes(value)) || new Set(input).size !== input.length) return null;
  return input.slice().sort();
}

function authorization(input) {
  if (!input || !Array.isArray(input.routes) || !input.routes.length || input.routes.length > profiles.length) return null;
  const routes = [];
  for (const route of input.routes) {
    const allowed = capabilityList(route?.capabilities);
    if (!profiles.includes(route?.profile) || !allowed?.length || routes.some(entry => entry.profile === route.profile) ||
        (route.profile === "read-only" && allowed.includes("write")) ||
        (route.profile === "full-access" && (allowed.length !== unrestrictedCapabilities.length ||
          !unrestrictedCapabilities.every(value => allowed.includes(value)))) ||
        (route.profile === "scoped" ? typeof route.scope !== "string" || !digest.test(route.scope) : route.scope !== undefined)) return null;
    routes.push({ profile: route.profile, capabilities: allowed, ...(route.scope ? { scope: route.scope } : {}) });
  }
  return { routes: routes.sort((left, right) => left.profile.localeCompare(right.profile)) };
}

function inheritedAuthorization(profile) {
  if (!["read-only", "development", "workshop", "full-access"].includes(profile)) return null;
  const routes = [{ profile: "read-only", capabilities: ["read"] }];
  if (profile !== "read-only") {
    routes.push({ profile, capabilities: profile === "full-access" ? unrestrictedCapabilities : ["read", "write"] });
  }
  return authorization({ routes });
}

function allowsStep(ceiling, step) {
  const route = ceiling?.routes.find(entry => entry.profile === step.profile);
  return !!route && step.requires?.length > 0 && step.requires.every(value => route.capabilities.includes(value)) &&
    (!step.requires.includes("browser") || ["scratch", "subprocess", "network"].every(value => step.requires.includes(value))) &&
    (!step.requires.includes("blender") || ["scratch", "subprocess", "write"].every(value => step.requires.includes(value))) &&
    (step.profile === "read-only" || step.profile === "full-access" || step.requires.includes("write"));
}

function observations(input, supported, scopedRevision, now = Date.now()) {
  if (!Array.isArray(input) || input.length > profiles.length) return null;
  const reports = [];
  for (const report of input) {
    const verified = capabilityList(report?.capabilities);
    if (!profiles.includes(report?.profile) || !supported.includes(report.profile) ||
        reports.some(entry => entry.profile === report.profile) || !verified?.length ||
        !["windows-sandbox", "windows-account"].includes(report.environment) ||
        (report.profile === "full-access"
          ? report.environment !== "windows-account" || report.sandbox !== "danger-full-access" || verified.includes("isolated-review")
          : !["read-only", "workspace-write", "os-isolated"].includes(report.sandbox)) ||
        typeof report.runtime !== "string" || !digest.test(report.runtime) ||
        (report.profile === "scoped" ? !scopedRevision || report.scope !== scopedRevision : report.scope !== undefined) ||
        !Number.isSafeInteger(report.observedAt) || report.observedAt > now + 30_000 ||
        now - report.observedAt >= preflightLifetime) return null;
    reports.push({ profile: report.profile, capabilities: verified, environment: report.environment,
      sandbox: report.sandbox, runtime: report.runtime, observedAt: report.observedAt,
      ...(report.scope ? { scope: report.scope } : {}) });
  }
  return reports;
}

function resolveRoute(host, mission, step, now = Date.now()) {
  const preferred = checkRoute(host, mission, step, now);
  if (preferred.receipt || !mission.authorization || step.allowProfileFallback !== true) return preferred;
  for (const profile of profiles) {
    if (profile === step.profile) continue;
    const alternative = checkRoute(host, mission, { ...step, profile }, now);
    if (alternative.receipt) {
      return { receipt: { ...alternative.receipt, requestedProfile: step.profile } };
    }
  }
  return preferred;
}

function checkRoute(host, mission, step, now) {
  if (!host.profiles?.includes(step.profile) || !host.efforts?.includes(mission.effort)) {
    return { reason: "The relay no longer advertises the requested profile or reasoning effort." };
  }
  if (!mission.authorization) return {};
  if (!allowsStep(mission.authorization, step)) return { reason: "The step exceeds its mission authorization." };
  const route = mission.authorization.routes.find(entry => entry.profile === step.profile);
  const report = host.missionPreflights?.find(entry => entry.profile === step.profile);
  if (!report || now - report.observedAt >= preflightLifetime || report.scope !== route.scope ||
      (route.scope && route.scope !== host.scopedRevision)) {
    return { reason: "Awaiting a current capability preflight for " + step.profile + " and the authorized scope." };
  }
  const failed = mission.current?.failedPreflight;
  if (failed?.profile === step.profile && report.observedAt <= failed.observedAt) {
    return { reason: "Awaiting a refreshed capability preflight after relay admission changed." };
  }
  const missing = step.requires.filter(value => !report.capabilities.includes(value));
  if (missing.length) return { reason: "The relay preflight lacks: " + missing.join(", ") + "." };
  const outsideCeiling = report.capabilities.filter(value => !route.capabilities.includes(value));
  if (outsideCeiling.length) return { reason: "The relay route exceeds the mission ceiling: " + outsideCeiling.join(", ") + "." };
  return { receipt: { requestedProfile: step.profile, effectiveProfile: report.profile,
    missionId: mission._id, authorizedCapabilities: route.capabilities, requiredCapabilities: step.requires,
    verifiedCapabilities: report.capabilities, environment: report.environment, sandbox: report.sandbox,
    runtime: report.runtime, observedAt: report.observedAt, ...(route.scope ? { scope: route.scope } : {}) } };
}

module.exports = { allowsStep, authorization, capabilityList, inheritedAuthorization, observations, preflightChanged, resolveRoute };
