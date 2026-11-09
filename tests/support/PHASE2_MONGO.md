# Isolated Phase 2 database integration tests

**MongoDB integration validation: PASSED.** The ordinary PowerShell run `67aeab9f0f2d458491a2ddfad87eb68f` passed all 538 backend tests with zero failures and zero skips. Its transcript records removal of the isolated container and both named volumes. The run covered the real HTTP, rollback, campaign authorization, and fresh-process reload cases.

Start Docker Desktop and wait for its Linux engine to run. In a normal Windows PowerShell window outside ChatGPT, run:

```powershell
& 'C:\Users\Romain\projects\Crossworld Creative\crossworld_backend\tests\support\run-phase2-mongo.ps1'
```

The runner saves a transcript to `phase2-mongo-<run ID>.log` in the backend repository, so the result can be inspected without copying the terminal output. It executes the complete backend test suite with the real MongoDB integration test enabled. It creates a fresh database named `sa_phase2_<unique run ID>` in a dedicated single-member replica set. The only published port is `127.0.0.1:37027`. If that port is occupied, startup fails; the runner does not stop its occupant.

The runner sets `SA_PHASE2_TEST_MONGO_URI` only for its process and restores its prior value afterward. The integration test rejects any address outside the dedicated local test prefix. Application Atlas connections and application data are not used.

Each run creates a uniquely named container and two explicitly named data/config volumes, all bearing the same ownership label. A `finally` block checks each exact name and label before removing it. There is no global prune, unrelated container stop, or application database reset. The downloaded image remains cached for future runs.

The default official image is `mongo:8.0`. The runner prints its image ID and repository digest. To repeat a specific image exactly, use the reported digest:

```powershell
& 'C:\Users\Romain\projects\Crossworld Creative\crossworld_backend\tests\support\run-phase2-mongo.ps1' -Image 'mongo@sha256:<reported digest>'
```

The exit code is the backend test exit code; setup or cleanup failures also fail the run. The prepared suite covers creation, progression, persistence, resource management, ownership, idempotency, concurrent revisions and cross-character transaction rollback. It also stops the initial HTTP server, disconnects its database client and launches a fresh Node process to compare saved characters through authenticated HTTP reads. Disposable campaign fixtures check GM-only milestone authorization, owner advancement, outsider rejection, and rules-version/strict-schema rejection. These real-database checks must pass before Phase 2 can be marked complete.

Current environment diagnosis (2026-11-08): Docker Desktop and its backend processes are running and the standard Docker named pipes exist. The execution account is already in `docker-users`. Both `desktop-linux` and `default` contexts fail with permission denied. A read-only Windows `IsTokenRestricted` diagnostic confirms this ChatGPT execution process has a restricted token. This points to the execution-session boundary rather than missing group membership or an absent daemon; a normal PowerShell run is the required comparison. Docker documents that the helper service may be stopped normally with its WSL 2 engine: https://docs.docker.com/desktop/setup/install/windows-permission-requirements/ . No service, group, ACL, Docker setting or context was changed.

The current managed session does not permit requesting elevated sandbox execution. Do not use alternate accounts, scheduled tasks, a new exposed Docker TCP socket or permission changes to bypass that boundary. The script can be run directly by the user in their normal terminal; administrator elevation is not required for the diagnostic. Its preflight fails before creating resources if Docker remains inaccessible.

The ordinary Windows PowerShell 5.1 comparison passed Docker's Linux-engine preflight (run `972d8ae991d741f18ed3c290210f9337`), confirming the Docker access issue is specific to the restricted execution session. The user's PowerShell 5.1 initially blocked script execution; the user enabled scripts for that process only. The PowerShell 7 policy observed in the restricted session did not predict the user's PowerShell 5.1 policy. After the `Phase 2 isolated run` line, the runner may be quiet while Docker downloads its image and starts MongoDB.

The first successful connection from PowerShell 5.1 exposed native argument quoting during replica-set setup. The runner uses JavaScript single quotes for that argument, and the passing run above verifies setup, execution, and cleanup from the ordinary terminal.
