import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const express = require("express");
import {build as phase2Build} from './helpers/phase2.mjs';
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../src/config/env");
test("actual authenticated rules routes expose eight Callings and reject forged preview ownership", async () => {
  const app = express();
  app.use(express.json());
  app.use("/archipelago", require("../src/modules/archipelago/routes"));
  app.use((error, _req, res, _next) =>
    res.status(error.statusCode ?? 500).send({ message: error.message })
  );
  const server = await new Promise((resolve) => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  const url = `http://127.0.0.1:${
    server.address().port
  }/archipelago/system/rules-2024`;
  const token = jwt.sign({ _id: "111111111111111111111111" }, JWT_SECRET);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  try {
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    const rules = await response.json();
    assert.equal(rules.callings.length, 8);
    assert.equal(rules.persistentCreationEnabled, true);
    const ledger = {
      version: 3,
      ruleset: "srd-5.2.1",
      revision: 0,
      baseAttributes: {
        might: 13,
        agility: 13,
        resolve: 13,
        wit: 13,
        instinct: 13,
        spirit: 13,
      },
      levels: [{ callingId: "doctor", choices: {} }],
    };
    const preview = await fetch(url + "/preview", {
      method: "POST",
      headers,
      body: JSON.stringify({ ledger }),
    });
    assert.equal(preview.status, 200);
    const body = await preview.json();
    assert.equal(body.health.max, 9);
    assert.equal(body.tabletopReady, false);
    for (const invalid of [
      { ledger, owner: "someone-else" },
      { ledger: { ...ledger, owner: "someone-else" } },
      { ledger: { ...ledger, levels: [{ callingId: "constructor" }] } },
    ]) {
      assert.equal(
        (
          await fetch(url + "/preview", {
            method: "POST",
            headers,
            body: JSON.stringify(invalid),
          })
        ).status,
        400
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("authenticated persistent routes save, reload and enforce ownership without a database connection", async () => {
  const Character = require("../src/modules/archipelago/characters/model");
  const methods = ["create", "countDocuments", "findOne", "findOneAndUpdate"];
  const original = Object.fromEntries(methods.map(key => [key, Character[key]]));
  let saved;
  Character.countDocuments = async () => 0;
  Character.create = async value => (saved = { _id: "333333333333333333333333", ...structuredClone(value) });
  Character.findOne = query => ({ lean: async () => saved && query._id === saved._id && query.owner === saved.owner ? structuredClone(saved) : null });
  Character.findOneAndUpdate = (query, update) => ({ lean: async () => {
    if (query.owner !== saved.owner || query.documentRevision !== saved.documentRevision) return null;
    Object.assign(saved, structuredClone(update.$set)); return structuredClone(saved);
  } });
  const app = express();
  app.use(express.json());
  app.use("/archipelago", require("../src/modules/archipelago/routes"));
  app.use((error, _req, res, _next) => res.status(error.statusCode ?? 500).send({ message: error.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/archipelago/characters`;
  const headers = owner => ({ "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ _id: owner }, JWT_SECRET)}` });
  const owner = "111111111111111111111111", other = "222222222222222222222222";
  try {
    const fixture=phase2Build("gunslinger");
    const body={name:"HTTP Sailor",creation:fixture.ledger.creation,attributes:fixture.ledger.baseAttributes,firstLevel:fixture.ledger.levels[0]};

    assert.equal((await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 401);
    const created = await fetch(base, { method: "POST", headers: headers(owner), body: JSON.stringify(body) });
    assert.equal(created.status, 201);
    const character = await created.json();
    assert.equal(character.rulesSummary.totalLevel, 1);
    const url = `${base}/${character._id}`;
    assert.equal((await fetch(url, { headers: headers(other) })).status, 404);
    assert.equal((await fetch(url+'/preview',{method:'POST',headers:headers(other),body:'{}'})).status,404);
    for(const route of ['rules-2024/advance','rules-2024/resources','rules-2024/equipment','rules-2024/folio'])assert.equal((await fetch(url+'/'+route,{method:'POST',headers:headers(owner),body:'{}'})).status,404);
    assert.equal((await fetch(url,{method:'PATCH',headers:headers(owner),body:JSON.stringify({expectedRevision:0,notes:'Bypass receipt'})})).status,404);
    const read = await (await fetch(`${base}/${character._id}`, { headers: headers(owner) })).json();
    assert.equal(read.documentRevision, 0);
    assert.equal(read.rulesSummary.health.max, 12);
    assert.deepEqual(read.rulesLedger, character.rulesLedger);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of methods) Character[key] = original[key];
  }
});
