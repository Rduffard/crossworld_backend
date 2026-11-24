# Private Windows execution

The hosted worker runs under the existing Windows account. Start it with **Start Crossworld Operations.cmd**. It verifies the local Codex subscription and write profiles, reuses the registered device credential, takes its single-instance lock, and reconnects after relay outages. The backend issues assignments by default. The existing launcher and any local startup entry that calls it use the same path. A lost worker lease can interrupt a turn and requires explicit continuation before more work runs.

## Workspace and Git permissions

| Selection | Normal command sandbox |
| --- | --- |
| Read-only inspection | Read-only Windows sandbox in the selected workspace. |
| Development repository editing | Writes in the existing backend, frontend, Archipelago, and Sanguine Engine checkouts. The initial working directory is the backend checkout. Name the intended repository in the assignment. |
| Workshop editing | Reads and writes throughout [D:\Loom Art Workshop](<D:/Loom Art Workshop>). |

Normal edit commands run with Codex workspace-write and its network-disabled setting. The worker probes write enforcement on Windows, including blocked writes in the C: production art and Unity Assets directories. `.git` and other paths protected by Codex may need an approval. A one-time command approval can execute that exact command outside the sandbox under your account. Review the command, working directory and target before approving. No approval is granted automatically by Operations.

Operations uses existing Git Credential Manager and SSH configuration when available. Explicit owner instructions determine when Codex should commit, push, or open a pull request. No GitHub App, separate Windows account or VM is needed. Codex may request a one-time dashboard approval if Git metadata or network access needs to leave the sandbox. For pull requests, use an authenticated `gh` if available. The Windows worker also has a fallback that uses the local Git credential helper and prints only the pull request URL. It requires a stored credential with permission to create a PR on the origin repository. An SSH-only credential can push but cannot authenticate to the pull request API.

```powershell
node crossworld_backend/tools/operations-worker/open-pull-request.mjs 'C:\Users\Romain\projects\Crossworld Creative\crossworld_backend' feature/my-branch main 'Pull request title'
```

The owner-only API, per-device authentication, single-use command approvals, and normal filesystem scopes are technical controls. Owner direction for in-sandbox Git actions, publishing prohibitions for arbitrary commands, and care with credentials are instructions. The shared Windows account and unelevated sandbox are not credential-read isolation. Production art lives outside the normal writable roots. Its promotion requires a separate human decision for a command with the exact production target. One-time sandbox escape approvals can reach anything this Windows account can access. The optional typed broker, local integration-branch adapter, and version-switch supervisor remain available for testing and are not prerequisites for ordinary editing or Git.

## Blender, Unity, and Aseprite

Operations uses the existing local tools with a named allowlist for MCP inspection. Blender scene and addon status, Unity object inspection and test status, and Aseprite sprite inspection are exposed when their configured servers are available. Blender Python execution, Unity C# or menu dispatch, and Aseprite Lua are not exposed through those desktop MCP servers because they run with native process privileges. Use the installed application's background or batch commands in the relevant writable workspace for modeling, rendering, authorized test runs, and pixel edits. A batch command outside the sandbox needs the same one-time approval as any other command.

The configured Blender and Unity live bridges need the relevant app and bridge running. Aseprite's core CLI tools can run with its GUI closed. Native save, overwrite, crash-recovery, sign-in, license, and Windows UAC dialogs have no dashboard response handler. App-server filesystem and command approval requests continue to use the normal dashboard. Persistent typed broker and MCP policy settings apply only to their optional adapters and do not control direct CLI commands.

## Keep publishing disabled

The active Sanguine Engine workflow is compatibility CI only. GitHub's default branches pin vendored Sanguine Engine tarballs at 0.69.4 for the backend and 0.69.2 for Archipelago. Both local consumer lockfiles pin a checked-in 0.69.4 tarball. The frontend has no engine dependency. Engine updates can be distributed as reviewed vendored tarballs and lockfiles without publishing. Registry migration workflows are manual-only in the revised checkouts. The live backend still has the scheduled **Prepare engine dependency update** workflow, which can propose a registry migration but cannot publish a package. Do not merge a registry migration while keeping the vendored dependency. Existing backend and website deployment triggers are unchanged.

The authenticated Actions inspection found only **Sanguine Engine CI** active in the engine repository and no publisher on `main`. If **Sanguine Engine CI and Release** or an equivalent publishing workflow is restored on a branch, disable it under **Actions → workflow → … → Disable workflow** and cancel queued publishing runs before pushing to that branch. Keep publisher credentials out of workflows. Existing package consumers need only Read access under the package's **Package settings → Manage Actions access**. Repository workflow settings and live runs were not modified by this revision.

[Codex sandbox and approvals](https://learn.chatgpt.com/docs/agent-approvals-security) · [Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp) · [GitHub package access](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)
