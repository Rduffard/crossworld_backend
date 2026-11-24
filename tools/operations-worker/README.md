# Crossworld Operations local execution bridge

The Crossworld Creative dashboard at `/operations` uses the existing Crossworld login. Express authorizes the configured account and stores jobs in MongoDB. A dependency-free Node 22 worker on Windows makes outbound HTTPS requests to the VM. The worker launches the installed Codex CLI app-server over private stdio using the signed-in Windows user's ChatGPT subscription.

The bridge uses `thread/start`, `thread/resume`, `turn/start`, and `turn/interrupt`. It converts supported app-server notifications into activity, execution, and final-response records. The dashboard polls for transcript slices in order. Command execution events carry the original command, working directory and exit status when the CLI supplies them. Output deltas and completed output are shown separately. [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server)

## Configuration and startup

Use the [hosted deployment and Windows onboarding guide](HOSTED-ONBOARDING.md) for production settings, rollout order, and the double-click launcher.

## Security boundaries

- Only the configured account ID can access user routes. Device credentials authorize device endpoints only, and the VM stores their SHA-256 digests. The worker uses certificate-validated TLS and rejects redirects. Plain HTTP is reserved for an explicit loopback test mode.
- Codex login data stays in the Windows user profile. The bridge never reads the Codex credential store or sends account responses to the VM. The device token stays out of Codex's environment, and model API keys are excluded from that environment. Worker-generated output redacts known credential patterns and exact occurrences of its device token.
- The C: and D: selections set the only permitted working directories. The worker requests Codex's read-only command sandbox with network access disabled, disables configured MCP servers and extension features, and denies approval requests. A local ledger limits continuations to threads created by that registered worker in the selected workspace. Production promotion requires explicit human approval.
- The current host uses Codex's unelevated Windows sandbox. It does not enforce denied read paths and has weaker network isolation than the elevated implementation. The working-directory allowlist and prompt instructions do not create a read isolation boundary. Use the bridge with a trusted VM and trusted prompts. Redaction is best-effort. The VM and database operators can read stored prompts and transcripts. Configure VM access logs to omit Authorization headers and request bodies, and protect MongoDB and its backups. [Windows sandbox documentation](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- Raw app-server streams, stderr, account metadata, and private model reasoning are excluded from the relay. Transcript limits are surfaced in the UI. Files and artifacts remain on the Windows host.

## Persistence and failure behavior

| Record | Storage and identifiers |
|---|---|
| Host and worker identity | `operations_hosts` stores host ID, owner ID, credential digest, revocation time, capability list, instance ID and last heartbeat. |
| Session | Jobs share an application session ID and retain the local Codex thread ID. Each follow-up also references its parent job. Local Codex owns the underlying thread history. |
| Job | `operations_jobs` stores a request ID, host, workspace, model, effort, prompt, worker role, status, timestamps and result. Only a single job can hold a host's active assignment. |
| Event | Each job stores a bounded, ordered event stream. Worker batches are acknowledged by sequence offset and retried unchanged if their response is lost. |
| Approval | Phase 1 records denied app-server approval requests in the execution stream. A future actionable approval record needs its own ID, job ID, request reference, requested scope, decision, deciding user and timestamps. |
| Artifact | Phase 1 reports available file-change events without transfer. A future artifact record needs an ID, workspace-relative path, job and host IDs, size, hash, and separate promotion approval. |

Jobs transition from queued to running, then to completed, failed, cancelled, or interrupted. Completed means the Codex turn finished. Check the transcript for individual command exit codes and validation results. Running cancellation first enters cancelling. The worker interrupts the turn after a sustained connection loss and retries the connection. Expired assignments become interrupted and never automatically run again. Revocation rejects further authenticated calls and interrupts the host's outstanding work. An assignment can complete before a cancellation reaches Codex.

An active worker is direct-execution only. Barnaby's future First Mate role can use the same host, session and job identifiers. Phase 1 has no orchestrator or scheduling service.

## Diagnostics

From the workspace root, run the mock-worker integration with the backend dependencies installed and local MongoDB running on its default port. It uses an isolated temporary database and a random loopback port.

```powershell
node crossworld_backend/tools/operations-worker/integration.mjs
node crossworld_backend/tools/operations-worker/integration.mjs --live
node crossworld_backend/tools/operations-worker/integration.mjs --cancel-live
```

The live option uses the local ChatGPT subscription for read-only diagnostics, including a follow-up and a workshop probe. Add the live cancellation flag to interrupt a harmless running wait command through the relay. No test requires changing application credentials, updating the VM, or changing production assets.

The D: live diagnostic observed Windows PowerShell startup error `8009001d` under the sandbox. A read-only shell fallback verified the D: working directory and the presence of `00_Workshop_Config/paths.json`.
