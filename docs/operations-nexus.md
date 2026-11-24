# Project Nexus checkpoint

## P0 First Mate delegation

The first milestone implements a narrow conversational action for an independent Operations interface review. It binds the request to an active First Mate execution, resolves the Art Director and current project mandate, and writes a separate queued job with an employee, objective, source conversation, source turn, call identifier, and expected revisions. The review uses the existing host lease and the read-only execution profile. The updated relay disables local MCP and approval grants for this job type. The objective assignment list and job transcript preserve the handoff and execution evidence.

Each turn can queue one such review. Retrying the same dynamic tool call returns the existing receipt. The same host processes the job after the current turn releases the lease, subject to dispatch pause and subscription holds. Review completion and owner acceptance remain distinct.

The loopback integration fixture exercises authorization, ineligible recipient rejection, concurrent retry, queue behavior, separate claiming, profile, and durable attribution. It uses fixture records and a simulated relay. Live provider invocation, the deployed interface review, and the owner's acceptance tests remain open.

## Release and continuation

Deploy through backend main CI, then update the registered Windows relay after its active execution drains. The backend change is additive. Existing relay versions can continue existing work. The action is registered on new Codex threads on the updated relay. Existing threads retain their original dynamic tool registration.

The current continuation path stores the Codex thread identifier per successful job. Eligible follow-ups inherit it or wait for the parent to finish. The relay uses thread/resume when it receives an authorized identifier in its local session index. Provider continuity across real owner turns and sidebar behavior still require rendered acceptance testing.

Next P0 work is direct employee conversation, structured employee identity and scoped operational reads, durable supervisor completion handoff, and resource-aware execution. Run the first actual Iona design assignment after both conversational delegation and direct employee communication are functional. Dedicated reports, visual direction, and production acceptance remain open. Game production stays paused.

## Second milestone

- Direct employee conversations bind a recipient independently of production assignment records. On claim, the relay receives current role, supervisor, active mandates, and assignment state. The relay enforces read-only execution with no local MCP or permission grants. Follow-ups inherit the recipient and the eligible Codex thread.
- First Mate can query bounded workforce, project, objective, and assignment records. A completed assignment lookup can return a response excerpt. Command Center links the source turn, delegate execution, objective, and report. Automatic supervisor follow-up is still open.
- Reports use completed assignment records and their committed response batches as durable evidence. The report endpoint is owner-scoped and redacts recognized credential patterns from the recorded brief and response.
- The frontend keeps one history entry per conversation, puts execution events newest first, and can copy or export the complete persisted conversation across pages. The report workspace offers copy and downloads. The Operations Manual describes those paths.

The backend unit suite passed 689 tests, and the loopback relay integration passed with and without the optional subscription-backed Nexus scenario. Reproduce the provider test with `node tools/operations-worker/integration.mjs --nexus-live` on a registered subscription-authenticated Windows development machine with loopback MongoDB. This test uses isolated organizational fixtures. It verified a real Iona response, a natural-language Barnaby tool call, a different Iona Codex thread, and a final review response returned by the report endpoint. It did not inspect the signed-in production application's rendered pages.

The first backend rollout was verified in Actions run 45450306917. Hosted health returned OK and unauthenticated Operations access returned HTTP 401. Browser fixtures passed Profile to Message, recipient persistence, draft restoration, and attributed response at 320, 390, 768, and 1440 pixels. Raw fixture screenshots are in the workspace docs/nexus-validation directory.

Production acceptance still requires the updated registered relay after active work drains. The sole online relay held an active orchestration turn during this implementation, so preserve it until handover. Hosted Iona visual review, authenticated mobile acceptance, true concurrent processing, broader governed actions, institutional memory, and integration expansion remain open. A single relay currently runs one job at a time.

## Third milestone

- An opt-in background slot runs one delegated read-only Operations review alongside the primary relay slot. The updated relay and backend negotiate support. Scoped editing defers when its workspace is under review, and full-access turns and background reviews do not overlap. The existing single-slot behavior is the default.
- Command Center shows recorded queue reasons and links to the worker report. Relevant completed or failed delegate outcomes are delivered as bounded context when the source conversation next executes. There is no autonomous model follow-up when that conversation is idle.
- Workflow links actual handoffs and review dependencies to employee, objective, transcript and report records. The owner can enter it from Command Center, Office, Workforce, Projects, Objectives or Reports.
- Knowledge can hold owner-approved decisions, preferences and operating policies with sources, revision checks and retained superseded versions. Retired records stop entering execution context. First Mate can query approved references and validated or approved knowledge. Draft conversation text is never promoted into memory automatically.
- Iona's isolated read-only review identified the clipped mobile workspace strip as the first design priority. The correction adds a labeled grouped Workspaces dialog, focus transfer and a compact report download control. The rendered fixture evidence and the attributed review are in workspace docs/nexus-validation.

The optional live Nexus suite verified a subscription-backed Iona conversation, a resumed Codex thread, actual typed delegation, a separate read-only Iona review, overlapping Barnaby and Iona execution timestamps, and the resulting report. It also verified private video staging and actual Codex vision from an extracted frame. Browser fixture coverage is 320, 390, 768 and 1440 pixels; it is separate from signed-in production acceptance.

To opt in after the active relay drains, set the worker account's persistent user environment variable OPERATIONS_BACKGROUND_REVIEWS to 1 before starting the refreshed launcher. The authenticated heartbeat must advertise support before the background slot can claim. Start a new Barnaby conversation to register the updated dynamic tools. Earlier Codex threads keep their original tool registration.

The hosted gate remains a relay handover followed by the actual owner-account smoke tests and the full deployed-interface Iona assignment. Preserve the current primary orchestration execution until its result is recorded. Do not restart game work.
