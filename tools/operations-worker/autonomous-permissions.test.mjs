import assert from "node:assert/strict";
import { test } from "node:test";
import { autonomousNetworkGrant } from "./profiles.mjs";

test("host policy grants network only to eligible development turns", () => {
  const development = {
    autonomousNetwork: true, supervised: true, root: "development", gitRoots: ["development"],
  };
  const network = { network: { enabled: true }, fileSystem: null };
  assert.deepEqual(autonomousNetworkGrant(network, development), { network: { enabled: true } });
  assert.equal(autonomousNetworkGrant(network, { ...development, autonomousNetwork: false }), null);
  assert.equal(autonomousNetworkGrant(network, { ...development, supervised: false }), null);
  assert.equal(autonomousNetworkGrant(network, { ...development, gitRoots: [] }), null);
  assert.equal(autonomousNetworkGrant({ ...network, fileSystem: { write: ["somewhere"] } }, development), null);
  assert.equal(autonomousNetworkGrant({ ...network, fileSystem: { entries: [] } }, development), null);
  assert.equal(autonomousNetworkGrant({ network: { enabled: false } }, development), null);
});
