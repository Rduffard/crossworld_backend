import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const backend = join(root, 'crossworld_backend');
const engine = join(root, 'sanguine-engine');
const frontend = join(root, 'archipelago');
const expected = JSON.parse(readFileSync(new URL('../tests/fixtures/verification-digests.json', import.meta.url), 'utf8'));
const normalize = value => value.trim().replace(/\s+/g, ' ');
const hashes = output => output.match(/\b[a-f0-9]{64}\b/g) ?? [];

export async function exhaustive({ run, recordTest, logs }) {
  assert.equal(hashes(Object.values(expected).join(' ')).length, 22);
  let passed = true;
  let timeouts = 0;
  async function stage(name, cwd, args, timeout, check = () => {}, isSuite = false) {
    console.log('RUN  ' + name);
    try {
      const result = await run({ name, cwd, args, timeout });
      if (isSuite) {
        recordTest(result);
        return;
      }
      timeouts += Number(result.timedOut);
      assert.equal(result.code, 0, result.output || name + ' exited with status ' + result.code);
      assert.equal(result.timedOut, false);
      check(result);
      console.log('PASS ' + name + ' ' + (result.ms / 1000).toFixed(2) + 's');
    } catch (error) {
      passed = false;
      console.error('FAIL ' + name, error.message);
    }
  }

  const suite = (name, cwd, pattern) => stage(name, cwd, [
    '--experimental-test-isolation=none', '--test', '--test-reporter=tap', pattern,
  ], 180000, undefined, true);

  await suite('engine-tests', engine, 'tests/*.test.cjs');
  await suite('frontend-tests', frontend, 'tests/*.test.mjs');
  for (const [file, baseline] of Object.entries(expected)) {
    const cwd = file === 'phase3-roll-probe.mjs' ? frontend : backend;
    await stage(file, cwd, ['tests/support/' + file], 420000, ({ output }) => {
      assert.deepEqual(hashes(output), hashes(baseline));
      for (const line of baseline.split('\n')) assert.ok(normalize(output).includes(line), 'Missing probe observation: ' + line);
    });
  }
  await stage('rest-regression', backend, ['tests/support/rest-regression.mjs'], 420000,
    ({ output }) => console.log('  ' + output.trim()));
  for (const [name, cwd] of [['backend', backend], ['frontend', frontend]]) {
    await stage(name + '-lint', cwd, ['node_modules/eslint/bin/eslint.js', '.'], 180000);
  }
  await stage('frontend-build', frontend, [
    'node_modules/vite/bin/vite.js', 'build', '--configLoader=native',
    '--outDir', join(logs, 'frontend-dist'),
  ], 180000);
  for (const [name, dir] of [
    ['backend', join(backend, 'src/modules/archipelago')],
    ['engine', join(engine, 'src')],
  ]) {
    await stage(name + '-dependencies', backend, ['scripts/archipelago-dependencies.cjs', dir], 60000,
      ({ output }) => assert.deepEqual(JSON.parse(output).all, []));
  }
  await stage('frontend-dependencies', backend, [
    'scripts/archipelago-dependencies.cjs', join(frontend, 'src'), '--jsx',
  ], 60000, ({ output }) => assert.deepEqual(JSON.parse(output).all, [[
    'features/map/components/MapCanvas.jsx',
    'features/map/layers/AuthoredShapeLayer.jsx',
    'features/map/layers/ShapeEditorLayer.jsx',
  ]]));
  await stage('syntax-and-engine-integrity', backend, ['scripts/verification-checks.cjs'], 90000,
    ({ output }) => console.log('  ' + output.trim()));
  return { failed: !passed, timeouts };
}

