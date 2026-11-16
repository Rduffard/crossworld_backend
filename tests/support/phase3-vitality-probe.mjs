import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(pathToFileURL(root + "/package.json"));
const { build, rules } = await import(
  pathToFileURL(root + "/tests/helpers/phase2.mjs")
);
const commands = require("./src/modules/archipelago/characters/commands");
const vitality = require("./src/modules/archipelago/combat/vitality/vitality");
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function normalizeIds(observation) {
  const ids = new Map();
  return JSON.parse(
    JSON.stringify(observation, (_, value) => {
      if (typeof value !== "string" || !uuid.test(value)) return value;
      if (!ids.has(value)) ids.set(value, "generated-" + ids.size);
      return ids.get(value);
    })
  );
}
const rows = [];
function capture(fn) {
  try {
    rows.push(fn());
  } catch (e) {
    rows.push([e.constructor.name, e.statusCode, e.code, e.message]);
  }
}
for (const [calling, level, path] of [
  ["doctor", 3],
  ["navigator", 9],
  ["navigator", 10],
  ["reaver", 11, "bloodwake"],
  ["gunslinger", 18, "deadeye"],
  ["tidecaller", 18, "sanguine-conduit"],
]) {
  const { character, summary } = build(calling, level, path);
  for (const fraction of [0, 0.5, 1]) {
    for (const condition of ["plain", "pending", "dead", "stable", "saves"]) {
      const state = structuredClone(character.rulesRuntime);
      state.health.current = Math.floor(state.health.max * fraction);
      state.temporaryHealth = 4;
      state.temporaryHealthMetadata = { source: "probe" };
      state.worldTime = 0;
      state.exhaustion = fraction === 0 ? 0 : fraction === 0.5 ? 3 : 5;
      state.deathSaves = {
        successes: condition === "saves" ? 1 : 0,
        failures: condition === "saves" ? 2 : 0,
        stable: condition === "stable",
        dead: condition === "dead",
        ...(condition === "stable" ? { stableUntil: 40 * 3600000 } : {}),
      };
      if (condition === "pending") state.pendingRelentlessRage = { dc: 15 };
      state.effects = [
        { id: "lasting", featureId: "spell:geas", expiresAt: 40 * 3600000 },
        { id: "focus", featureId: "spell:guidance", concentration: true },
        { id: "timed", featureId: "spell:light", expiresAt: 3600000 },
      ];
      if (calling === "reaver" && condition === "pending") {
        state.effects.push({
          id: "rage-instance",
          featureId: "calling:reaver:rage:1",
          rage: true,
          expiresAt: 40 * 3600000,
        });
        state.counters.relentlessRage = 1;
      }
      state.concentrationChecks = [{ id: "probe", dc: 10, effects: ["focus"] }];
      const run = (c, type, payload) =>
        commands.apply(c, {
          operationId: "vitality-parity",
          expectedRevision: c.documentRevision,
          rulesVersion: "SA-CHAR-1",
          type,
          payload,
        });
      const c = { ...character, rulesRuntime: state };
      for (const healthDelta of [-5, 0, 1, 1000, "2", 1.5, null]) {
        capture(() =>
          rules.runtime.update(summary, state, {
            type: "health",
            expectedRevision: state.revision,
            healthDelta,
          })
        );
        capture(() => run(c, "health.apply", { healthDelta }));
      }
      const die = Object.keys(state.hitDice)[0];
      for (const op of [
        { type: "short-rest", hitDice: [{ die, roll: 1 }] },
        { type: "short-rest" },
        { type: "long-rest", nourished: false },
        { type: "long-rest", nourished: true },
      ]) {
        capture(() =>
          rules.runtime.update(summary, state, {
            expectedRevision: state.revision,
            ...op,
          })
        );
        capture(() => {
          const { type, ...options } = op;
          const start = run(c, "rest.start", {
            restId: "vitality-probe",
            kind: type,
            startedAt: 0,
            options,
          });
          return run({ ...c, ...start.changes }, "rest.complete", {
            restId: "vitality-probe",
            completedAt: (type === "short-rest" ? 1 : 8) * 3600000,
          });
        });
      }
      for (const naturalRoll of [1, 2, 10, 18, 19, 20])
        capture(() =>
          run(c, "death-save.roll", { naturalRoll, confirmed: true })
        );
      for (const amount of [
        0,
        3,
        4,
        state.health.current + 4,
        state.health.current + state.health.max + 4,
      ]) {
        for (const critical of [false, true])
          capture(() => {
            const clone = structuredClone(c);
            const outcome = vitality.damage(clone, summary, {
              amount,
              critical,
              damageType: "force",
              confirmed: true,
            });
            for (const check of clone.rulesRuntime.concentrationChecks ?? [])
              if (check.id !== "probe") check.id = "generated";
            return [outcome, clone.rulesRuntime];
          });
      }
      for (const amount of [0, 1, 8, -1])
        capture(() =>
          run(c, "temp-health.choose", {
            amount,
            confirmed: true,
            source: "probe",
          })
        );
      for (const total of [14, 15])
        capture(() =>
          run(c, "relentless-rage.resolve", { total, confirmed: true })
        );
    }
  }
}
const json = JSON.stringify(rows.map(normalizeIds));
const { writeFileSync } = await import("node:fs");
if (process.argv[2]) writeFileSync(process.argv[2], json);
console.log(rows.length, createHash("sha256").update(json).digest("hex"));
