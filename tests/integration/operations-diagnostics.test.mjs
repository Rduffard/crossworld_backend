import assert from "node:assert/strict";
import test from "node:test";
import diagnostics from "../../src/modules/operations/diagnostics.js";
import resources from "../../src/modules/operations/resources.js";

test("Operations diagnostics exclude unexpected fields, including nested secrets", () => {
  const error = Object.assign(new Error("sensitive message"), {
    code: "ECONNRESET",
    cause: { headers: { authorization: "sensitive value" } },
    config: { password: "sensitive value" },
  });
  assert.deepEqual(diagnostics.failureDiagnostic(error, "operations"), {
    area: "operations", event: "request-failed", code: "ECONNRESET",
  });
  assert.equal(diagnostics.failureDiagnostic({ code: "arbitrary value" }, "operations").code, "UNCLASSIFIED");
});

test("worker text redacts credentials and preserves ordinary output", () => {
  const secrets = [
    "device-credential-fixture", "ghp_012345678901234567890",
    "eyJaaaa.aaaa.bbbb", "alice:secret", "authorization-fixture", "two words",
    "private-material-fixture",
  ];
  const input = [
    secrets[0], secrets[1], secrets[2], `mongodb://${secrets[3]}@host/db`,
    `Bearer ${secrets[4]}`, JSON.stringify({ nested: { client_secret: secrets[5] } }),
    `-----BEGIN OPENSSH PRIVATE KEY-----\n${secrets[6]}\n-----END OPENSSH PRIVATE KEY-----`,
    "Ordinary command output",
  ].join("\n");
  const output = diagnostics.redact(input, secrets[0]);
  for (const secret of secrets) assert.ok(!output.includes(secret));
  assert.match(output, /Ordinary command output/);
  assert.equal(diagnostics.redact("plain output"), "plain output");
});

test("resource telemetry limits fields and excludes malformed and stale readings", () => {
  const observedAt = 1234567;
  const source = {
    observedAt, cpu: 42, private: "omitted",
    memory: { total: 1024, free: 512, password: "omitted" },
    drives: { C: { total: 1024, free: 2048 }, D: { total: 2048, free: 256 }, E: { total: 99, free: 1 } },
  };
  assert.deepEqual(resources.resourceObservation(source, observedAt), {
    observedAt, cpu: 42, memory: { total: 1024, free: 512 },
    drives: { C: null, D: { total: 2048, free: 256 } },
  });
  assert.equal(resources.resourceObservation(source, observedAt + 120001), null);
});
