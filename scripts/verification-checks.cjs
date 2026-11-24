const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { parse } = createRequire(require.resolve('eslint'))('espree');

const root = join(__dirname, '../..');
const engine = join(root, 'sanguine-engine');
const backend = join(root, 'crossworld_backend');
const frontend = join(root, 'archipelago');
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const { name } = readJSON(join(engine, 'package.json'));
for (const dir of [backend, frontend]) {
  const spec = readJSON(join(dir, 'package.json')).dependencies[name];
  const lock = readJSON(join(dir, 'package-lock.json')).packages;
  const entry = lock['node_modules/' + name];
  const installed = readJSON(join(dir, 'node_modules', name, 'package.json'));
  assert.equal(lock[''].dependencies[name], spec);
  assert.equal(installed.version, entry.version);
  assert.match(entry.integrity, /^sha512-/);
  if (spec.startsWith('file:')) {
    assert.equal(spec, 'file:vendor/crossworld-sanguine-engine-' + entry.version + '.tgz');
    assert.equal(entry.resolved, spec);
    const archive = readFileSync(join(dir, spec.slice(5)));
    assert.equal(entry.integrity, 'sha512-' + createHash('sha512').update(archive).digest('base64'));
  } else {
    assert.match(spec, /^npm:@rduffard\/sanguine-engine@\^\d+\.\d+\.\d+$/);
    assert.equal(installed.name, '@rduffard/sanguine-engine');
    assert.equal(new URL(entry.resolved).origin, 'https://npm.pkg.github.com');
  }
}

let checked = 0;
for (const [dir, folders, sourceType] of [
  [backend, ['src', 'tests', 'scripts'], 'commonjs'],
  [engine, ['src', 'tests'], 'commonjs'],
  [frontend, ['src', 'tests'], 'module'],
]) {
  for (const folder of folders) {
    const base = join(dir, folder);
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:[cm]?js|jsx)$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      try {
        parse(readFileSync(path, 'utf8'), {
          ecmaVersion: 'latest',
          sourceType: entry.name.endsWith('.mjs') ? 'module' : entry.name.endsWith('.cjs') ? 'commonjs' : sourceType,
          ecmaFeatures: { jsx: dir === frontend },
        });
      } catch (error) {
        throw new Error(path + ':' + error.lineNumber + ' ' + error.message, { cause: error });
      }
      checked++;
    }
  }
}
console.log(checked + ' syntax checks and independent engine lockfile integrity checks');

