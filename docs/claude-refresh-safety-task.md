# Claude refresh safety

Claude refresh could lose a rotated token after a failed write and process exit. Separate provider writes could replace each other's store snapshots. A deleted profile could also be restored by a refresh that had already read it.

The host now writes protected recovery before replacing a credential. Recovery runs before another refresh, including after restart. Direct refresh and restart recovery are Windows-only. Recovery uses a separate DPAPI file. All store changes share an OS lock. Compare-and-replace runs under that lock. Deletion or replacement cancels recovery. Refresh locks use a credential-chain fingerprint and do not block unrelated chains.

Claude Code owns local credentials and imported snapshots. Imports do not receive an independent refresh chain. Imported accounts therefore lose automatic token refresh with this change. When an import expires, UsageBar asks the user to run Claude Code and re-import that account in Settings. Only explicitly UsageBar-owned credentials can refresh directly. This task adds no login flow.

## Review round 1

- S1: CI's Clippy contract declares Rust 1.85. Code and tests now use fs4 0.13.1 for OS locks.
- S2: Rotated documents have protected recovery and restart replay. Main-write failures remain visible. Recovery can be written even when the main store is unreadable.
- S3: All store changes share an OS lock. Claude compare-and-replace cannot undo deletion or lose another provider's write. Startup secret-file migration also uses the lock.
- S4: Locks follow credential chains. Replacement/removal releases a retained lock on retry. Unrelated chains can proceed.
- S5: Logs contain status and a whitelisted OAuth code, never unknown server values or descriptions. Existing error distinctions remain intact.
- S6: Expired imports receive an explicit re-import error. The loss of auto-refresh is stated above and in the PR body.
- S7: At the review check, #30 and #33 were still open. Rebase after #30, then #33. Keep #30's visible OAuth 429, route refresh 429 to #33's refresh hold, preserve storage errors through its catch, and keep #35's error distinctions.

The release single-instance guard does not cover development builds or Claude Code. The host combines normal probes for one instance. Each probe gets a new JavaScript runtime. Native process tests cover refresh exclusion, recovery replay, deletion and writes for another provider.

## Request and response audit

This review fix adds no HTTP fields. Access and refresh token fields already appear in host redaction lists. The local expectedAccessToken field remains redacted. Recovery previous/updated documents never enter logs or HTTP bodies. Server error prose is excluded from logs. Tests use only synthetic credentials in temporary stores. No real credentials were read or printed.

If protected recovery cannot be written, the host attempts a verified main-store write under the store lock. Only if both writes fail does it retain the response and chain lock in memory and report unsaved credentials. A crash before either protected write succeeds cannot save that response.

## Round 1 validation

- bun run check passed, including formatting, lint, type checks and Clippy.
- Claude plugin tests: 106 passed. New re-import and safe-log tests failed before the fix.
- Rust library tests: 211 passed; one live Edge test ignored. The restart test failed before the fix. The unreadable-main-store test failed before recovery was separated from the main file.
- Frontend production build and 17 Node script tests passed.
- Plugin bundling completed. All seven Claude source and bundled files match byte for byte.
- The full frontend suite stalled before it reported a test result, with default and thread pools. Those runs were stopped and are not claimed as passing.
- Local Rust commands used TAURI_CONFIG with externalBin disabled, as in the sidecar preparation script. The generated release sidecar is not part of this test build.
- The picomatch dependency audit failure belongs to main and is outside this change.
- No merge was performed.

## Review round 2

- S9: The host requires HTTPS before any refresh request. A regression using an allowed HTTP host failed before the fix.
- S2: A recovery-write error now triggers a verified main-store compare-and-replace under the store lock. Only failure of both stores retains memory and reports unsaved credentials. The native Windows test with blocked recovery and a writable main store failed before the fix.
- S4: Successful credential removal or replacement cancels shared pending state immediately. The production delete path releases the chain without another old-profile probe. A failed credential deletion keeps profile metadata for retry. The production-delete and delete-retry tests failed before their fixes.
- S8: Cargo's keyring feature tree contains only the default feature. Direct Claude refresh and recovery are now Windows-only. Other platforms reject before storage access or a refresh request. This build makes no native-backend or restart-recovery claim for Linux/macOS.
- S6: WAIT for the product decision. Import ownership, automatic-refresh policy and import errors are unchanged in this revision.
- S7: #30 is merged; #33 is still open. Rebase after #33 merges. Preserve OAuth 429 isolation, the refresh hold, visible storage errors and #35's error distinctions. No merge is part of this work.

Round 2 adds no request or response fields. HTTPS validation logs no URL or token. Persistence warnings
and unsaved errors use fixed text. Tests use only synthetic credentials in owned temporary stores.

## Round 2 validation

- bun run check passed, including formatting, lint, type checks and Clippy.
- Rust library tests: 218 passed; one live Edge test ignored. This includes native DPAPI restart replay and real concurrent store mutations.
- Claude plugin tests: 106 passed. The frontend production build passed.
- Plugin bundling completed. All seven Claude source and bundle files match byte for byte.
- The full frontend suite was not repeated in round 2; the round 1 local stall remains recorded above.
- The Windows-only native tests cover blocked recovery with a writable main store, production delete/replacement without an old-profile probe, and retry after a failed credential deletion.
- The non-Windows native rejection test is present for Linux CI. It cannot run on this Windows host.
- Local Rust checks excluded the generated release sidecar with TAURI_CONFIG, as in round 1.
- No request or response fields changed. S6 files remain unchanged. No merge was performed.

## Main integration after round 2

- Merged origin/main at 0ab6769e after #30 and #33 merged. This uses a merge commit and a normal push. No history rewrite or PR merge is part of this work.
- Git reported one conflict: plugins/claude/plugin.js, in refreshToken. The resolution keeps the native refresh transaction and routes its HTTP 429 response to #33's refresh hold.
- Removed the broad probe catch. Rate-limit checks still report their own HTTP 429 errors. A hold that arrives during a refresh cannot replace a credential-save or unsaved error.
- Kept #30's no-web-fallback policy during OAuth holds and its managed-account boundary. S6 ownership and import behavior remain unchanged.
- Incoming direct-refresh tests now use explicitly UsageBar-owned managed fixtures. Local Claude Code credentials still do not rotate.
- Four new regression cases failed before the fix: refresh versus usage hold routing for expired and valid tokens, and visible main-save and unsaved errors when a hold arrives during the transaction.
- No request or response fields were added. The existing access-token, refresh-token and expectedAccessToken redaction fields remain in place.
- Integration validation passed: bun run check, 127 Claude tests, 221 Rust library tests (one live Edge test ignored), frontend build and plugin bundling. All seven Claude source and bundle files match byte for byte. Rust checks used the same generated-sidecar exclusion. The full frontend suite was not repeated.

## Final review correction

- Merged origin/main at daef9df6 without conflicts. The main changes prepare release metadata; they do not change this task's ownership policy.
- S7: Usage could reject a token with HTTP 401 or 403 before its recorded expiry during a refresh hold. The probe then asked the user to log in again. The final auth-error branch now checks the refresh hold first and reports HTTP 429 with its retry time.
- Both new regression cases failed with the login error before the one-line fix. Save and unsaved errors still exit earlier and remain visible. OAuth holds still block shared web fallback.
- S6 remains unchanged. Claude Code imports lose automatic refresh and must be re-imported after expiry. The PR body states this behavior and the pending product decision.
- No request or response fields were added. Existing host redaction fields remain sufficient. Tests use only synthetic credentials.
- Validation passed: bun run check; 129 Claude tests with --maxWorkers=1 --no-file-parallelism; 221 Rust library tests, with one live Edge test ignored. The first parallel Claude run timed out during worker startup. Plugin bundling passed, and all seven Claude source/bundle files match byte for byte. Rust checks used the same generated-sidecar exclusion. The full frontend suite and frontend build were not repeated for this one-line correction.
