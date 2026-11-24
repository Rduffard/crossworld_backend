import os from "node:os";
import { statfsSync } from "node:fs";

function cpuClock() {
  let total = 0;
  let idle = 0;
  for (const { times } of os.cpus()) {
    idle += times.idle;
    total += Object.values(times).reduce((sum, value) => sum + value, 0);
  }
  return { total, idle };
}

function disk(drive) {
  try {
    const { blocks, bavail, bsize } = statfsSync(drive + ":\\");
    return { total: blocks * bsize, free: bavail * bsize };
  } catch { return null; }
}

export function resourceSampler() {
  let previous = cpuClock();
  let snapshot;
  return () => {
    const observedAt = Date.now();
    if (snapshot && observedAt - snapshot.observedAt < 30000) return snapshot;
    const current = cpuClock();
    const elapsed = current.total - previous.total;
    const cpu = elapsed > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - (current.idle - previous.idle) / elapsed)))) : null;
    previous = current;
    snapshot = {
      observedAt, cpu, memory: { total: os.totalmem(), free: os.freemem() }, drives: { C: disk("C"), D: disk("D") },
    };
    return snapshot;
  };
}
