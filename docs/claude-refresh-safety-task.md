# Claude refresh safety

Claude refresh could lose a rotated token after a failed write and process exit. Separate provider writes could replace each other's store snapshots. A deleted profile could also be restored by a refresh that had already read it.

The host now writes protected recovery before replacing a credential. Recovery runs before another refresh, including after restart. Windows recovery uses a separate DPAPI file. All store changes share an OS lock. Compare-and-replace runs under that lock. Deletion or replacement cancels recovery. Refresh locks use a credential-chain fingerprint and do not block unrelated chains.

Claude Code owns local credentials and imported snapshots. Imports do not receive an independent refresh chain. Imported accounts therefore lose automatic token refresh with this change. When an import expires, UsageBar asks the user to run Claude Code and re-import that account in Settings. Only explicitly UsageBar-owned credentials can refresh directly. This task adds no login flow.

## Review findings

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

If protected recovery itself cannot be written, the host retains the response and chain lock in memory and reports failure. A crash before any protected write succeeds cannot save that response.

## Validation

- bun run check passed, including formatting, lint, type checks and Clippy.
- Claude plugin tests: 106 passed. New re-import and safe-log tests failed before the fix.
- Rust library tests: 211 passed; one live Edge test ignored. The restart test failed before the fix. The unreadable-main-store test failed before recovery was separated from the main file.
- Frontend production build and 17 Node script tests passed.
- Plugin bundling completed. All seven Claude source and bundled files match byte for byte.
- The full frontend suite stalled before it reported a test result, with default and thread pools. Those runs were stopped and are not claimed as passing.
- Local Rust commands used TAURI_CONFIG with externalBin disabled, as in the sidecar preparation script. The generated release sidecar is not part of this test build.
- The picomatch dependency audit failure belongs to main and is outside this change.
- No merge was performed.
