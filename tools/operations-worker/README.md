# Crossworld Operations local execution bridge

The Crossworld Creative dashboard at `/operations` uses the existing Crossworld login. Express authorizes the configured account and stores jobs in MongoDB. A dependency-free Node 22 worker on Windows makes outbound HTTPS requests to the VM. The worker launches the installed Codex CLI app-server over private stdio using the signed-in Windows user's ChatGPT subscription.

The bridge uses `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, and `turn/interrupt`. The dashboard reads ordered transcript slices and displays command output, file changes, tool calls, warnings, and final Markdown when Codex supplies them. [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server)

## Configuration and startup

Use the [hosted deployment and Windows onboarding guide](HOSTED-ONBOARDING.md) for production settings, rollout order, and the double-click launcher.

See [private Windows execution](GOVERNANCE.md) for direct editing, Git authentication, and the package publishing hold.

For an existing installation, deploy the backend, deploy the frontend, and restart the updated Windows launcher from the refreshed checkout. Keep the registered device and the existing owner account. MongoDB creates a partial unique index on new continuation records. Existing jobs and threads remain usable with the read-only profile. No environment variable, credential, or production infrastructure change is required.

The worker advertises direct edit profiles after testing their write boundaries. Development editing covers the existing backend, frontend, Archipelago and engine repositories. Workshop editing covers the D: workshop. Both profiles use the existing Windows user and app installations.

## Security boundaries

- Only the configured account ID can access user routes. Device credentials authorize device endpoints only, and the VM stores their SHA-256 digests. The worker uses certificate-validated TLS and rejects redirects. Plain HTTP is reserved for an explicit loopback test mode.
- Codex login data stays in the Windows user profile. The bridge never reads the Codex credential store or sends account responses to the VM. The device token stays out of Codex's environment, and model API keys are excluded from that environment. Worker-generated output redacts known credential patterns and exact occurrences of its device token.
- Read-only jobs use the selected workspace root as their working directory. Edit jobs use explicit writable roots and a network-disabled sandbox. The worker verifies the Windows write boundaries with disposable files, limits configured MCP servers to selected inspection tools, and binds continuations to the registered device, workspace, and original permission profile.
- The installed 0.172.x app-server exposes granular approval policy through its experimental protocol capability. Edit turns can request a one-time command approval or a scoped filesystem grant. A one-time command approval may run that exact command outside the sandbox. It does not change the baseline profile for subsequent commands.
- The current host uses Codex's unelevated Windows sandbox. It does not enforce denied read paths and has weaker network isolation than the elevated implementation. The working-directory allowlist and prompt instructions do not create a read isolation boundary. Use the bridge with a trusted VM and trusted prompts. Redaction is best-effort. The VM and database operators can read stored prompts and transcripts. Configure VM access logs to omit Authorization headers and request bodies, and protect MongoDB and its backups. [Windows sandbox documentation](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- Raw app-server streams, stderr, account metadata, and private model reasoning are excluded from the relay. Transcript limits are surfaced in the UI. Files and artifacts remain on the Windows host.

## Persistence and failure behavior

| Record | Storage and identifiers |
|---|---|
| Host and worker identity | `operations_hosts` stores host ID, owner ID, credential digest, revocation time, capability list, instance ID and last heartbeat. |
| Session | Jobs share an application session ID and retain the local Codex thread ID. Each follow-up also references its parent job. Local Codex owns the underlying thread history. |
| Job | `operations_jobs` stores a request ID, host, workspace, model, effort, prompt, worker role, status, timestamps and result. Only a single job can hold a host's active assignment. |
| Event | Each job stores a bounded, ordered event stream. Worker batches are acknowledged by sequence offset and retried unchanged if their response is lost. |
| Approval | The assigned worker publishes an expiring request on its job. The owner can record a single decision per request. Recent decisions are retained with request metadata and timestamps. |
| Artifact | File-change events describe edits reported by Codex. Edited files stay on the Windows execution host. |

Jobs transition from queued to running, then to completed, failed, cancelled, or interrupted. Completed means the Codex turn finished. Check the transcript for individual command exit codes and validation results. Running cancellation first enters cancelling. The worker interrupts the turn after a sustained connection loss and retries the connection. Expired assignments become interrupted and never automatically run again. Revocation rejects further authenticated calls and interrupts the host's outstanding work. An assignment can complete before a cancellation reaches Codex.

Steering targets the active Codex turn. An instruction with an uncertain acknowledgement is never replayed automatically. A queued follow-up is stored separately and dispatched after its predecessor completes successfully with a resumable thread. If the predecessor is cancelled, fails, or loses its lease, the queued follow-up is interrupted. Use the latest turn in the session to continue.

## Diagnostics

From the workspace root, run the mock-worker integration with the backend dependencies installed and local MongoDB running on its default port. It uses an isolated temporary database and a random loopback port.

```powershell
node crossworld_backend/tools/operations-worker/integration.mjs
node crossworld_backend/tools/operations-worker/integration.mjs --live
node crossworld_backend/tools/operations-worker/integration.mjs --cancel-live
node crossworld_backend/tools/operations-worker/integration.mjs --interactive-live
node crossworld_backend/tools/operations-worker/integration.mjs --direct-git-live
node crossworld_backend/tools/operations-worker/check-permissions.mjs
```

The live options use the local ChatGPT subscription. The interactive test uses a disposable C: staging directory to check approval, steering, file edits, and queued continuation. The cancellation test interrupts a harmless wait command through the relay. The filesystem probe checks that all profiles enforce their expected write restrictions on Windows.

The D: live diagnostic observed Windows PowerShell startup error `8009001d` under the sandbox. A read-only shell fallback verified the D: working directory and the presence of `00_Workshop_Config/paths.json`.
