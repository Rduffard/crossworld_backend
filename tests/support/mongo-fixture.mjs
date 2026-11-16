import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, rm, access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const { MongoClient } = createRequire(import.meta.url)('mongoose').mongo;
const host = '127.0.0.1';

async function mongoExecutable() {
  if (process.env.SA_TEST_MONGOD) return resolve(process.env.SA_TEST_MONGOD);
  if (process.platform === 'win32') {
    const root = join(process.env.ProgramFiles || 'C:\\Program Files', 'MongoDB', 'Server');
    const versions = await readdir(root).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const version of versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const executable = join(root, version, 'bin', 'mongod.exe');
      if (await access(executable).then(() => true, () => false)) return executable;
    }
  }
  return 'mongod';
}

export async function verifyTestMongo(uri, pid, { initializing = false } = {}) {
  const match = /^mongodb:\/\/127\.0\.0\.1:(\d+)\/(sa_phase2_[a-z0-9]+)\?directConnection=true$/.exec(uri);
  if (!match || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('Expected a fixture-owned loopback MongoDB process and disposable database');
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 500, connectTimeoutMS: 500 });
  try {
    const admin = client.db('admin');
    const status = await admin.command({ serverStatus: 1 });
    if (Number(status.pid) !== pid) throw new Error('MongoDB listener does not belong to this test run');
    const hello = await admin.command({ hello: 1 });
    if (initializing) {
      await admin.command({
        replSetInitiate: { _id: match[2], members: [{ _id: 0, host: host + ':' + match[1] }] },
      });
    } else if (hello.setName !== match[2] || !hello.isWritablePrimary || !hello.logicalSessionTimeoutMinutes) {
      throw new Error('The fixture replica set is not ready to run transactions');
    }
  } finally {
    await client.close();
  }
}

export async function startTestMongo(t) {
  const started = performance.now();
  const executable = await mongoExecutable();
  const dir = await mkdtemp(join(tmpdir(), 'sanguine-mongo-'));
  let child;
  let closed;
  t.after(async () => {
    const stopping = performance.now();
    try {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        child.kill();
        await closed;
      }
    } finally {
      await rm(dir, { recursive: true, maxRetries: 5, retryDelay: 100, force: true });
      console.log('MongoDB teardown ms:', Math.round(performance.now() - stopping));
    }
  });

  const listener = createServer();
  listener.listen(0, host);
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const database = 'sa_phase2_' + randomUUID().replaceAll('-', '');
  const uri = 'mongodb://' + host + ':' + port + '/' + database + '?directConnection=true';
  const logPath = join(dir, 'mongod.log');
  child = spawn(executable, [
    '--bind_ip', host, '--port', String(port), '--dbpath', dir,
    '--replSet', database, '--logpath', logPath,
  ], { stdio: 'inherit', windowsHide: true });
  closed = once(child, 'close');
  closed.catch(() => {});
  try {
    await once(child, 'spawn');
    const deadline = Date.now() + 30000;
    let initializing = true;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error('mongod exited during startup (exit code ' + child.exitCode + ')');
      }
      try {
        await verifyTestMongo(uri, child.pid, { initializing });
        if (!initializing) {
          console.log('MongoDB startup ms:', Math.round(performance.now() - started));
          return { uri, pid: child.pid, dir, database };
        }
        initializing = false;
      } catch (error) {
        if (error.name !== 'MongoServerSelectionError' &&
            error.message !== 'The fixture replica set is not ready to run transactions') throw error;
      }
      await delay(200);
    }
    throw new Error('Timed out waiting for the replica set primary');
  } catch (error) {
    const log = await readFile(logPath, 'utf8').catch(() => '');
    if (log) console.error(log.trimEnd().split(/\r?\n/).slice(-12).join('\n'));
    throw new Error('Isolated MongoDB setup failed. Install MongoDB Community Server 8.x or set SA_TEST_MONGOD to the mongod executable. ' +
      'Check that child processes, loopback sockets and the temporary directory are available. ' + (error.code || error.message), { cause: error });
  }
}

export async function restartSnapshot({ uri, pid, dir }) {
  const output = join(dir, 'restart.json');
  const child = spawn(process.execPath, [
    fileURLToPath(new URL('./phase2-restart-probe.mjs', import.meta.url)),
  ], {
    env: { ...process.env, SA_PHASE2_TEST_MONGO_URI: uri, SA_TEST_MONGO_PID: String(pid), SA_TEST_MONGO_RESULT: output },
    stdio: 'inherit',
    windowsHide: true,
  });
  const timeout = setTimeout(() => child.kill(), 60000);
  try {
    const [code, signal] = await once(child, 'close');
    if (code !== 0) throw new Error('Fresh-process MongoDB probe failed (' + (signal || code) + ')');
    return JSON.parse(await readFile(output, 'utf8'));
  } finally {
    clearTimeout(timeout);
  }
}
