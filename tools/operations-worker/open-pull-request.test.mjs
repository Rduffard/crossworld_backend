import assert from "node:assert/strict";
import { openPullRequest, repositoryFromOrigin } from "./open-pull-request.mjs";

assert.equal(repositoryFromOrigin("git@github.com:example/backend.git"), "example/backend");
assert.equal(repositoryFromOrigin("https://github.com/example/frontend.git"), "example/frontend");
assert.equal(repositoryFromOrigin("https://credential@github.com/example/frontend.git"), undefined);
const input = { head: "fix/branch", base: "main", title: "Test PR" };
const credential = (repository) => {
  assert.equal(repository, "example/frontend");
  return "mock-credential";
};
const url = await openPullRequest("example/frontend", input, {
  credential,
  request: async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/example/frontend/pulls");
    assert.equal(options.headers.Authorization, "Bearer mock-credential");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { ...input, body: "" });
    return { ok: true, json: async () => ({ number: 12 }) };
  },
});
assert.equal(url, "https://github.com/example/frontend/pull/12");
await assert.rejects(openPullRequest("example/frontend", input, {
  credential, request: async () => { throw new Error("mock-credential"); },
}), /^Error: GitHub did not confirm/);
console.log("Pull request helper PASS (mock HTTP)");
