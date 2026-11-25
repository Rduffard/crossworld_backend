# Operations worker development

- Develop in an isolated Git worktree and run tests with disposable configuration, storage, identifiers, and processes. Use loopback services for tests that claim, drain, restart, or replace a worker.
- Treat the production scheduled task, supervisor, worker, operational state, device registration, and all installed runtime and release files as production infrastructure. Routine assignments may inspect approved status surfaces. They may never edit those files, stop those processes, change their task registrations, or point production at a checkout.
- Stage executable supervisor releases from an exact reviewed commit. Verify the manifest digest and keep the supervisor runtime separate from worker release directories and development worktrees.
- Changing or restarting production requires the existing owner authorization and controlled maintenance handover. Confirm the held, drained host before switching. Restore the last known working configuration if readiness fails. Preserve unrelated assignments.
- A full-access shell is not an isolation boundary. Keep ordinary engineering scoped and reserve unrestricted lifecycle actions for explicitly authorized maintenance.
