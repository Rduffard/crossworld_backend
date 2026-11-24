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
- The installed 0.172.x app-server exposes granular approval policy through its experimental protocol capability. Development turns can request owner approval for Git metadata paths inside authorized repositories and for network access for the rest of that turn. A one-time command approval remains available if Windows still requires it for a particular Git command. Grants do not persist to the next turn.
- The current host uses Codex's unelevated Windows sandbox. It does not enforce denied read paths and has weaker network isolation than the elevated implementation. The working-directory allowlist and prompt instructions do not create a read isolation boundary. Use the bridge with a trusted VM and trusted prompts. Redaction is best-effort. The VM and database operators can read stored prompts and transcripts. Configure VM access logs to omit Authorization headers and request bodies, and protect MongoDB and its backups. [Windows sandbox documentation](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- Raw app-server streams, stderr, account metadata, and private model reasoning are excluded from the relay. Transcript limits are surfaced in the UI. Files and artifacts remain on the Windows host.

## Optional unattended execution

### Full Access

Deploy the compatible backend and frontend first. When the Windows worker has finished active assignments, update its checkout and set the worker account's persistent user environment variable `OPERATIONS_FULL_ACCESS` to `1`. Start a new worker process from an environment that has picked up the setting. The worker probes the installed app-server's unrestricted command mode before advertising Full Access. Select Full Access explicitly when starting a session. Continuing a session preserves the original profile and workspace.

The profile uses `danger-full-access` at thread start/resume and `dangerFullAccess` on turns, with approval policy `never`. The starting folder can be either company workspace. Shell commands can access both drives, the network, local Git, and installed browser or native executables to the extent available to the Windows worker account. Native dialogs and Windows security prompts can still require local interaction. The bridge's MCP tool selection remains in effect.

Full Access trusts the owner, the relay VM, local execution inputs including instructions found in repositories and webpages, and the Windows user account. Workspace selection is a starting folder. Owner authorization, worker registration and thread-profile binding are application-enforced. Production-art promotion requires exact human authorization, and package publishing, releases and release tags are prohibited. In Full Access those constraints are agent instructions for shell activity. The broker enforces its own operation restrictions. Avoid using this profile when command-level enforcement is required.

To disable it, drain active work, remove the environment variable, and restart the worker. Cancel any queued Full Access jobs you no longer want to run. They cannot be claimed by a worker that does not advertise the profile. Verify an unloaded candidate against a disposable relay using `node crossworld_backend/tools/operations-worker/integration.mjs --live --full-access-live`. [App-server sandbox configuration](https://learn.chatgpt.com/docs/app-server#command-execution)

### Scoped development network

Set the Windows worker's user environment variable `OPERATIONS_AUTONOMOUS_NETWORK` to `development` and apply it at a controlled worker restart after active assignments finish. The launcher inherits this setting. Remove the variable and restart to return to manual network review.

An opted-in development editing turn can receive a network-only app-server permission request automatically for the remainder of that turn. The worker records each automatic grant in the execution transcript. Mixed filesystem and network requests retain manual review, as do Git metadata grants and approvals for commands that would run outside the sandbox. The read-only and workshop profiles do not receive automatic network grants. The Windows trust assumptions above apply when opting in because the grant covers all network destinations and Windows read isolation is limited. [App-server permission requests](https://learn.chatgpt.com/docs/app-server#permission-requests)

## Persistence and failure behavior

| Record | Storage and identifiers |
|---|---|
| Host and worker identity | `operations_hosts` stores host ID, owner ID, credential digest, revocation time, capability list, instance ID and last heartbeat. |
| Session | Jobs share an application session ID and retain the local Codex thread ID. Each follow-up also references its parent job. Local Codex owns the underlying thread history. |
| Job | `operations_jobs` stores a request ID, host, workspace, model, effort, prompt, worker role, status, timestamps and result. Only a single job can hold a host's active assignment. |
| Event | The relay stores immutable event batches separately from the job and publishes them by committed sequence offset. The dashboard loads 40 events at a time and can reveal earlier events. Command output keeps up to 64,000 characters per command, preserving the beginning and end when output is larger. Command output has no shared quota with Activity or final responses. Historical inline events remain readable. |
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
## Private media

The updated worker stores private uploads in `D:\Crossworld Operations\Media` by default. Set `OPERATIONS_MEDIA_ROOT` on the worker to use another absolute local NTFS directory outside the Operations workspaces. In Windows folder security, disable inherited access rules on the dedicated directory and grant inheritable Full Control to the worker's Windows account and SYSTEM. Set the owner to the worker account or SYSTEM. The worker creates `Attachments` and `Temporary`, checks those permissions, refuses redirected directories, and advertises media only after the store is available. The gateway receives one bounded chunk at a time through the authenticated relay. MongoDB retains metadata and content hashes.

The default storage quota is 10 GiB. Set `OPERATIONS_MEDIA_QUOTA_BYTES` to change it. The worker preserves 256 MiB of free space and limits individual uploads to 100 MiB. Upload interrupted in an open browser tab can be retried from the server-reported offset. Use **Discard** to cancel an unfinished upload. Unfinished files and abandoned turn staging directories are eligible for cleanup after 24 hours. Ready files are preserved. Browser previews require owner authentication and an online device.

Command Center can send up to four PNG, JPEG, or WebP images of up to 12 MiB each from its execution device. The worker verifies each stored hash and stages a job-local copy for Codex `localImage` input. Images can be sent with a new message or a follow-up, including a resumed Codex thread. Attachments embedded in a steering instruction or schedule are unavailable. Use a video preview in the uploads library to choose a frame offset. If the worker finds local FFmpeg, **Extract a frame** saves a JPEG linked to the original clip and the requested timestamp. The JPEG can be sent to Codex as an image. The original clip stays on disk. Set `OPERATIONS_FFMPEG_EXE` to specify a trusted installed binary if the worker cannot find it in PATH.

Enable artifact returns when starting a new immediate turn with the Workshop edit profile. The worker verifies Windows sandbox writes to the exact job directory under `Outbox` and denies writes to the parent, other jobs, and the private attachment directory. Ask for a PNG, JPEG, WebP, MP4, MOV, or WebM preview. The worker's publication tool takes a basename from that job's directory and checks the active lease, signature, size, hash, and storage quota before attaching it to the conversation. Each authorized turn has up to four exports of up to 32 MiB each. The original local export remains in the Outbox for inspection, and the published copy counts toward the media quota. Clear archived Outbox source files separately only after checking against the stored copies. These files remain experimental and require a separate production promotion decision.

Back up `Attachments` and the Operations MongoDB metadata from the same maintenance window. Use a separate trusted local drive or an approved encrypted backup target, preserving the opaque file names and restricting access to the backup operator. Exclude `Temporary`. Restore into a compatible media root, then verify each file against its recorded SHA-256 before serving it. The default root is one physical drive and supplies no redundancy.
