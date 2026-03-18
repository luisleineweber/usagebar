# Augment Windows Placeholder

Status: visible in Settings, blocked from probing on Windows.

Planned implementation:
- Detect local Augment desktop or CLI session state first.
- Prefer local process or CLI-backed usage over browser cookies.
- Add a direct local probe only after a stable Windows auth/state source is confirmed.

Why this placeholder exists:
- The provider was listed as a missing candidate in `docs/specs/provider-source-evaluation-2026-03-16.md`.
- This keeps the future provider visible in Settings without pretending Windows support exists yet.
