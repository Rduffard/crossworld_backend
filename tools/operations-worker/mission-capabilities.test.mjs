import assert from "node:assert/strict";
import { test } from "node:test";
import capabilities from "../../src/modules/operations/mission-capabilities.js";

const { inheritedAuthorization, observations, resolveRoute } = capabilities;
const now = Date.now();
const browser = ["read", "scratch", "subprocess", "network", "browser"];
const step = { profile: "read-only", reviewer: "reviewer", requires: browser };
const reports = [
  { profile: "read-only", sandbox: "read-only", environment: "windows-sandbox", capabilities: ["read"] },
  { profile: "full-access", sandbox: "danger-full-access", environment: "windows-account", capabilities: browser },
].map(report => ({ ...report, observedAt: now, runtime: "a".repeat(64) }));
const profiles = reports.map(report => report.profile);
const host = { profiles, efforts: ["low"], missionPreflights: observations(reports, profiles, undefined, now) };
const mission = { _id: "mission", effort: "low", authorization: inheritedAuthorization("full-access") };

test("a verified Full Access route can serve an independent reviewer with fallback authorized", () => {
  const { receipt } = resolveRoute(host, mission, { ...step, allowProfileFallback: true }, now);
  assert.equal(receipt.requestedProfile, "read-only");
  assert.equal(receipt.effectiveProfile, "full-access");
  assert.equal(receipt.environment, "windows-account");
  assert.deepEqual(receipt.verifiedCapabilities, browser.slice().sort());
});

test("owner locks, a restricted parent and stale preflights each prevent fallback", () => {
  const flexible = { ...step, allowProfileFallback: true };
  assert.ok(resolveRoute(host, mission, step, now).reason);
  assert.ok(resolveRoute(host, { ...mission, authorization: inheritedAuthorization("read-only") }, flexible, now).reason);
  assert.ok(resolveRoute(host, mission, flexible, now + 15 * 60_000).reason);
});

test("a compatible preferred route remains in use", () => {
  const { receipt } = resolveRoute(host, mission, { ...step, requires: ["read"], allowProfileFallback: true }, now);
  assert.equal(receipt.effectiveProfile, "read-only");
});
