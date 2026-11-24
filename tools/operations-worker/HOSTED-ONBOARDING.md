# Crossworld Operations hosted onboarding

## 1. Sign in and confirm your account ID

Sign in with your existing Crossworld Creative account at [Crossworld Creative](https://www.crossworldcreative.com/). While still on that origin, open the browser developer console and run this expression. It calls the existing authenticated profile endpoint and prints only the account ID.

```js
void (async () => {
  const token = JSON.parse(localStorage.getItem("cw_auth") || "{}").token;
  if (!token) throw new Error("Sign in to Crossworld Creative first.");
  const response = await fetch("https://api.crossworldcreative.com/users/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Account verification failed (HTTP ${response.status}).`);
  const { _id } = await response.json();
  if (!/^[a-f0-9]{24}$/.test(_id)) throw new Error("Unexpected account ID format.");
  console.log(_id);
})();
```

## 2. Configure the existing backend

Use your existing VM console or SSH access with the backend workflow's `VM_USER` and `VM_HOST`. Run the following on the VM. When prompted, paste the 24-character ID from step 1. The command preserves the existing database configuration and JWT secret and reports only success or a configuration error.

```bash
cd /home/iroamm/crossworld_backend
read -r -p 'Crossworld owner account ID: ' operations_owner
OPERATIONS_OWNER_INPUT="$operations_owner" node <<'NODE'
const fs = require("node:fs");
const dotenv = require("dotenv");
const id = process.env.OPERATIONS_OWNER_INPUT;
if (!/^[a-f0-9]{24}$/.test(id || "")) throw new Error("Expected a lowercase 24-character account ID.");
const raw = fs.readFileSync(".env", "utf8");
const vars = dotenv.parse(raw);
if ((vars.JWT_SECRET || "").length < 32) {
  throw new Error("Configure a strong JWT_SECRET of at least 32 characters in the backend secret store before proceeding.");
}
const lines = raw.split(/\r?\n/).filter((line) => !/^\s*(?:export\s+)?OPERATIONS_OWNER_ID\s*=/.test(line));
while (lines.at(-1) === "") lines.pop();
lines.push("OPERATIONS_OWNER_ID=" + id, "");
const staged = ".env.operations-" + process.pid;
fs.writeFileSync(staged, lines.join("\n"), { mode: 0o600, flag: "wx" });
fs.renameSync(staged, ".env");
console.log("Operations owner configured.");
NODE
unset operations_owner
```

Keep the existing `DB_URI` and `PORT` settings. The current deployment expects port 3001 and retains the VM's `.env`. Keep `JWT_SECRET` in the existing secret store. If PM2 injects either `JWT_SECRET` or `OPERATIONS_OWNER_ID` directly, update the existing PM2 environment source as well because it takes precedence over dotenv. Rotating the shared JWT secret requires existing Crossworld users to sign in again. Never copy the JWT secret or a device credential into GitHub Actions or the frontend configuration.

The deployment preserves the VM's `.env` and checks its owner ID before switching runtimes. The workflow reads the VM connection secrets from GitHub Actions. Set the owner in the VM's `.env` using the steps above.

The frontend uses the repository's tracked `.env.production`, which already sets `VITE_API_BASE_URL=https://api.crossworldcreative.com`. The launcher sets `OPERATIONS_BACKEND_URL` to the same origin. The Windows user profile provides the existing Codex subscription sign-in and a DPAPI-encrypted device credential.

## 3. Deploy the backend, then the frontend

1. Land the backend changes using your normal Git process. The backend `main` pipeline packages `src` and dependencies and activates them under PM2 at `/home/iroamm/crossworld_backend`. Wait for its public health check.
2. Check the API before deploying the frontend. Run the following from PowerShell. Expected output is `OK`, then `401`. A `404` means the Operations routes are missing or the feature is disabled by its environment settings.

   ```powershell
   curl.exe -fsS https://api.crossworldcreative.com/healthz
   curl.exe -sS -o NUL -w "%{http_code}" https://api.crossworldcreative.com/operations/hosts
   ```

3. Land the frontend changes. Its `main` workflow builds Vite and syncs `dist/` to `/var/www/portfolio`. Open [Crossworld Operations](https://www.crossworldcreative.com/operations) and sign in with the same account. The frontend requires the site's SPA fallback for direct URLs. The live host already responds to the direct route.

## 4. Register the Windows host

1. In **Manage devices**, enter a name such as **Windows execution PC** and select **Register device**.
2. Select **Copy credential**. Leave the page open. The credential is displayed once.
3. In Windows Explorer, open `C:\Users\Romain\projects\Crossworld Creative\crossworld_backend\tools\operations-worker`. Double-click **Start Crossworld Operations.cmd** as your normal Windows user.
4. At the masked prompt, paste the credential and press Enter. The launcher saves it using Windows DPAPI. Select **Hide** in the dashboard and clear the credential from clipboard history if it was recorded there.
5. Wait for the worker window to show **ChatGPT sign-in verified** and **Device authentication verified**. The dashboard should show your device as connected. Keep the window open and use Ctrl+C to stop it. For later starts, double-click the same launcher. For replacement, revoke the previous device as needed, register a new device in the dashboard, and double-click **Register Crossworld Operations.cmd**.

The Windows host needs Node.js 22 or later and Codex CLI 0.172.x running under the existing signed-in Windows account. If executable discovery fails, set the Windows user environment variable `OPERATIONS_CODEX_EXE` to the absolute path to `codex.exe` and open a new launcher window. The launcher pins HTTPS to the production API and stops duplicate local instances. The backend also enforces a worker lease. A restart may wait for the prior lease to expire.

## 5. Run the first hosted diagnostic

Select your online host, **C: · Development**, **GPT-6.2 Sol**, and **low** effort. Submit the following prompt.

> Run a read-only command that prints your actual current Windows working directory and the marker CW-HOSTED-OK. If Windows PowerShell fails to start, use cmd.exe. Do not read or modify files. In your final response, report the command output and the marker.

Open **Execution** and expand the command and output entries. Confirm the C: workspace and marker. Open **Summary**, then select **Copy response as Markdown** or **Copy session summary**. To verify continuation, keep this job selected, enter `What exact marker did you just report? Do not run tools.`, and select **Send follow-up**.

To verify cancellation, start a new session with a harmless read-only wait command, such as `Start-Sleep -Seconds 20` or a supported shell equivalent. Select **Cancel job** while the turn runs. The job may already have completed by the time a cancellation reaches the host.

## Active-turn steering and queued follow-ups

The installed Codex CLI 0.172.0 app-server schema includes `turn/steer`. It accepts `threadId`, text `input`, and `expectedTurnId`. It returns the accepted `turnId` for the existing turn. It requires a matching, active turn and carries no model, workspace, or sandbox overrides. The dashboard currently sends follow-ups as new turns after a resumable turn finishes. [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server#steer-an-active-turn)

To add steering, an owner-only endpoint would need to persist each instruction with a request ID and target worker assignment, thread, and expected turn. The worker would need to issue `turn/steer` on the same app-server connection and report acceptance or rejection. A lost acknowledgement should be shown as an uncertain outcome unless the client can prove delivery. Automatically replaying such a request could duplicate the instruction.

The installed schema exposes no separate queue for ordinary future user turns. A queued follow-up should be a durable Crossworld job tied to its predecessor. Dispatch it only after that predecessor has reached an eligible terminal state and the worker can resume its thread. Define ordering and cancellation in the relay. App-server's documented queueing for tool output is a separate capability. [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server)
