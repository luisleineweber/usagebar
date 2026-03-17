# Windows Adaptation Status

## Current Stage

OpenUsage now runs as a Windows-first tray app in this fork and is no longer blocked on the old macOS-only panel stack.

See [windows-provider-rollout-plan.md](windows-provider-rollout-plan.md) for the provider-by-provider delivery plan.
See [windows-provider-verification.md](windows-provider-verification.md) for the shared Windows validation checklist.

Working now:

- Windows `tauri dev` and `cargo check`
- `npm`-based build/dev flow
- Windows tray window instead of macOS `NSPanel`
- Embedded Rust SQLite host API
- Cross-platform credential storage via keyring
- Manifest-driven Windows provider support/surfacing metadata
- Codex on Windows
- Antigravity on Windows, including free-usage style pools when exposed by the local app
- Amp surfaced as an experimental Windows provider via the documented CLI secrets path
- Cursor Windows roaming DB lookup
- Claude local-usage fallback through `ccusage`
- Copilot surfaced as an experimental Windows provider with active `gh` account selection
- OpenCode surfaced again as an experimental Windows provider
- Gemini surfaced as an experimental Windows provider with Windows CLI OAuth path discovery
- JetBrains AI Assistant surfaced as an experimental Windows provider
- JetBrains now scans both JetBrains and Android Studio (`Google`) roaming roots, with case-insensitive IDE directory matching

## Current Limitations

- Cursor still needs more real-world validation across free and paid account states.
- Amp still needs a real signed-in Windows validation pass.
- Claude Windows auth/session parity is incomplete.
- Copilot still needs real free/paid validation and multi-account runtime evidence on Windows.
- Gemini still needs real signed-in Windows validation beyond the new CLI path coverage.
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
