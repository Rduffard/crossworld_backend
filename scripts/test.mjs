import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './test-process.mjs';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const logs = mkdtempSync(join(tmpdir(), 'sanguine-verification-'));
const requested = process.argv.slice(2);
const mode = requested[0];
if (mode?.startsWith('--') && (!['--fast', '--full', '--mongo'].includes(mode) || requested.length !== 1)) {
  throw new Error('Use --fast, --full, --mongo, or a list of backend test files');
}
const mongo = 'integration/mongo-transactions.test.mjs';
const http = new Set([
  'http/character-combat-routes.test.mjs', 'http/combat-routes-and-resolution.test.mjs', 'http/shared-router-contracts.test.mjs',
  'http/character-catalog-and-commands.test.mjs', mongo,
]);
const fast = new Set([
  'characters/attribute-modifiers.test.mjs', 'equipment/catalog-and-loadout.test.mjs', 'equipment/weapon-properties.test.mjs',
  'integration/ability-validation-and-pending-advancement.test.mjs', 'combat/attack-records.test.mjs',
  'persistence/command-errors.test.mjs', 'characters/identity.test.mjs', 'equipment/inventory.test.mjs',
  'resources/rest-interruptions-and-time.test.mjs', 'system/catalog-loading-boundary.test.mjs', 'integration/character-engine-contract.test.mjs',
  'equipment/loadout-projection.test.mjs', 'resources/hit-dice-reconciliation.test.mjs',
  'resources/pool-reconciliation.test.mjs', 'persistence/saved-runtime-and-projections.test.mjs',
  'spells/spell-slot-reconciliation.test.mjs', 'characters/point-buy.test.mjs',
]);
const longest = ['persistence/characters-and-receipts.test.mjs', 'persistence/command-transactions.test.mjs', 'integration/character-lifecycle.test.mjs'];
const testRoot = join(cwd, 'tests');
const available = readdirSync(testRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map(entry => relative(testRoot, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .sort();
const selected = mode === '--mongo' ? [mongo] : mode === '--fast' ? [...fast] :
  !mode || mode === '--full' ? available : requested.map(path => path.replaceAll('\\', '/').replace(/^tests[/\\]/, ''));
for (const file of new Set([...selected, ...fast, ...http, ...longest])) {
  if (!available.includes(file)) throw new Error('Unknown backend test file: ' + file);
}
const started = performance.now();
const results = [];
const counts = { tests: 0, pass: 0, fail: 0, skipped: 0, cancelled: 0 };
let timeouts = 0;
let failed = false;
const seconds = ms => (ms / 1000).toFixed(2) + 's';
const run = options => runProcess({ cwd, logs, ...options });

async function testFile(file) {
  const result = await run({
    name: file, timeout: file === mongo ? 150000 : 180000,
    args: ['--experimental-test-isolation=none', '--test', '--test-reporter=tap',
      '--test-timeout=' + (http.has(file) ? 12000 : 120000), join('tests', file)],
  });
  recordTest(result);
}

function recordTest(result) {
  results.push(result);
  const fileCounts = Object.fromEntries(Object.keys(counts).map(key => [
    key, Number(result.output.match(new RegExp('^# ' + key + ' (\\d+)', 'm'))?.[1] ?? 0),
  ]));
  for (const key of Object.keys(counts)) counts[key] += fileCounts[key];
  const timedOut = (result.output.match(/failureType: 'testTimeoutFailure'/g) ?? []).length;
  timeouts += timedOut + Number(result.timedOut);
  const bad = result.code !== 0 || result.timedOut || fileCounts.tests === 0 ||
    fileCounts.fail > 0 || fileCounts.skipped > 0 || fileCounts.cancelled > 0;
  failed ||= bad;
  const reported = Number(result.output.match(/^# duration_ms ([\d.]+)/m)?.[1]);
  const overhead = Number.isFinite(reported) ? ' (runner overhead ' + seconds(Math.max(0, result.ms - reported)) + ')' : '';
  console.log((bad ? 'FAIL ' : 'PASS ') + result.name + ' ' + seconds(result.ms) +
    overhead + ' | ' + fileCounts.pass + '/' + fileCounts.tests + ' passed');
  for (const timing of result.output.matchAll(/(?:HTTP|MongoDB) (?:startup|teardown) ms: \d+/g)) console.log('  ' + timing[0]);
  if (bad) console.error(result.output || 'No test output');
}

console.log('Verification logs: ' + logs);
console.log('Backend test files: ' + selected.length + ' (2 unit workers; HTTP/MongoDB run alone)');
const pending = [
  ...longest.filter(file => selected.includes(file)),
  ...selected.filter(file => !http.has(file) && !longest.includes(file)),
];
await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
  while (pending.length) await testFile(pending.shift());
}));
for (const file of selected.filter(file => http.has(file))) await testFile(file);

if (mode === '--full') {
  const { exhaustive } = await import('./verification.mjs');
  const result = await exhaustive({ run, recordTest, logs });
  failed ||= result.failed;
  timeouts += result.timeouts;
}

console.log('Totals:', counts, '| timed out:', timeouts, '| wall:', seconds(performance.now() - started));
console.log('Slowest test files:', results.sort((a, b) => b.ms - a.ms).slice(0, 5)
  .map(result => result.name + ' ' + seconds(result.ms)).join(', '));
process.exitCode = failed ? 1 : 0;

