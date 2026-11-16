import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export async function runProcess({ name, args, cwd, timeout, logs }) {
  const log = join(logs, name + '.log');
  mkdirSync(dirname(log), { recursive: true });
  const descriptor = openSync(log, 'w');
  const started = performance.now();
  let child;
  try {
    child = spawn(process.execPath, args, {
      cwd, stdio: ['ignore', descriptor, descriptor],
      detached: process.platform !== 'win32', windowsHide: true,
    });
  } finally {
    closeSync(descriptor);
  }

  let timedOut = false;
  let cleanup;
  const stop = async () => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'inherit', windowsHide: true });
      const status = await new Promise(resolve => {
        killer.once('error', () => resolve(null));
        killer.once('close', resolve);
      });
      if (status !== 0 && child.exitCode === null && child.signalCode === null) {
        console.error('Process tree cleanup unavailable; stopping direct child ' + child.pid);
        child.kill();
      }
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    console.error(name + ' exceeded ' + timeout / 1000 + 's; see ' + log);
    cleanup = stop().catch(error => {
      console.error('Process cleanup:', error.message);
      child.kill();
    });
  }, timeout);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    await cleanup;
    return { name, code, timedOut, output: readFileSync(log, 'utf8'), ms: performance.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

