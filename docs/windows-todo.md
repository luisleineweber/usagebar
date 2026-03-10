# Windows TODO

## Open Issues

- Panel anchoring is still too mac-like: it behaves top-aligned, but on Windows the taskbar is usually at the bottom. The panel should stay bottom-anchored to the taskbar/tray edge and grow upward as its height changes.
- Antigravity is currently showing `100% left` all the time and needs a Windows-specific fix for real remaining-usage calculation.
- Logged-out or currently unavailable providers should not be auto-removed from the sidebar. Their availability state should mainly affect how they are shown and toggled in Settings, not whether they disappear from navigation entirely.

## Follow-Up

- Recheck Cursor behavior across free, trial, and paid accounts on Windows.
- Continue improving Claude Windows auth/session detection.
- Finish Windows-specific window polish and tray interaction details.
