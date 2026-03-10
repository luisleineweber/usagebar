# Windows Adaptation Status

## Current Stage

OpenUsage now runs as a Windows-first tray app in this fork and is no longer blocked on the old macOS-only panel stack.

Working now:

- Windows `tauri dev` and `cargo check`
- `npm`-based build/dev flow
- Windows tray window instead of macOS `NSPanel`
- Embedded Rust SQLite host API
- Cross-platform credential storage via keyring
- Codex on Windows
- Antigravity on Windows, including free-usage style pools when exposed by the local app
- Cursor Windows roaming DB lookup
- Claude local-usage fallback through `ccusage`

## Current Limitations

- Cursor still needs more real-world validation across free and paid account states.
- Claude Windows auth/session parity is incomplete.
- Only active/logged-in providers should appear outside Settings; that cleanup is still being tightened.
- The panel still needs better Windows anchoring when its height changes after opening.
- The window still needs more Windows-specific polish to remove the remaining floating/shadow feel.
- Some providers are still placeholders on Windows and should remain Settings-only for now.

## Verified So Far

- `npm run test -- --run`
- `npm run build`
- `cargo check`
- `npm run tauri -- dev`

Observed runtime behavior:

- Antigravity displays usage on Windows.
- Codex displays usage on Windows.
- Claude no longer depends only on the older OAuth credential path.
- Cursor Windows pathing has been corrected, but more runtime validation is still needed.

## Next Steps

1. Re-anchor the panel to the Windows tray/taskbar edge after live height changes.
2. Keep placeholders and logged-out providers out of the sidebar and overview.
3. Continue hardening Cursor free-usage handling.
4. Continue improving Claude Windows auth/session handling.
5. Polish the Windows window appearance and interaction model.
