# Claude refresh storage safety

UsageBar could report refresh success after credential storage failed. Storage errors now stop the probe with a visible error. The full credential document and original storage destination remain unchanged.

Status: partial. The regression test cannot run because Vitest is not installed in this worktree. Cross-process refresh exclusion and durable recovery of rotated credentials still need implementation and tests. Do not treat this change as completion of point 3.

The release process has a single-instance guard in src-tauri/src/main.rs. This does not establish exclusion with development processes or Claude Code. Host probe serialization still needs review.

No request or response fields were added. No changes concern error classification, retry escalation, process rate-limit holds, or rate-limit keys. No reference source was reused.

Proposed PR title: fix(claude): surface refreshed credential storage failures

Proposed PR body: Claude refresh could report success when the credential write failed. Stop the probe with a visible storage error while preserving the original destination and full credential document. Add a regression test for write failure after token rotation. Validation is blocked by missing Vitest. Cross-process exclusion and durable rotation recovery remain open; this is a partial change.
