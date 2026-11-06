import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const base = '../src/modules/archipelago/system/';
const catalogs = require(base + 'blueprints/catalogs');
test('catalog content preserves the pre-extraction serialized baseline', () => {
 assert.equal(createHash('sha256').update(JSON.stringify(catalogs)).digest('hex'), '8ef0655826b430bb4243072918d570c27e669c21bf7234672fa051aeecf77cca');
});
test('catalog exports share leaf references and preserve mutable definitions', () => {
 const leaves = {"callings":"characters/callings.js","originPaths":"characters/originPaths.js","origins":"characters/origins.js","specializations":"characters/paths.js","reputation":"world/reputation.js"};
 assert.deepEqual(Object.keys(catalogs), Object.keys(leaves));
 for (const [key, file] of Object.entries(leaves)) {
  assert.strictEqual(catalogs[key], require(base + 'blueprints/' + file));
  assert.equal(Object.isFrozen(catalogs[key]), false);
 }
 assert.strictEqual(require(base + 'index').catalogs, catalogs);
});
test('blueprint controller sends the existing assembled object', () => {
 let sent;
 require(base + 'controller').getBlueprint({}, {send(value) { sent = value; }});
 assert.strictEqual(sent, require(base + 'index'));
 assert.strictEqual(sent.catalogs, catalogs);
});
