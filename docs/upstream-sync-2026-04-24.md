# Upstream sync review - 2026-04-24

This branch was compared with `upstream/main` after `git fetch --all --prune`.
At review time `main...upstream/main` reported `50 91`: this fork had 50
Windows-specific commits not in upstream and upstream had 91 commits not in this
fork.

The goal of this sync was not to rebase the Windows fork onto upstream. Several
upstream changes assume the official app identity, macOS behavior, or dependency
levels that are not safe for this repo yet. Instead, the usable upstream work was
ported in Windows-compatible form and the skipped work was recorded here.

## Ported or kept

- In-app changelog/release notes: kept the Windows release-notes flow and added
  the `0.1.0-beta.4` changelog entry.
- Windsurf quota fixes: retained the Windows provider implementation and added
  the upstream-style missing/invalid balance handling.
- Local HTTP API and plugin host growth: kept this branch's plugin-host surface
  and extended it with browser-backed requests and direct Windows credential
  target reads where providers need them.
- Proxy support: ported as `~/.usagebar/config.json` support instead of the
  upstream `~/.openusage/config.json` path so this fork does not read or write
  official-app config by accident.
- Custom Claude OAuth: documented and supported the custom OAuth path while
  preserving Windows credential handling.
- Cursor and Antigravity fixes: accepted the account/plan robustness fixes and
  adapted them to this branch's provider model.
- Panel positioning/focus fixes: kept the Windows tray geometry work and the
  settings-to-tray selection sync added on this branch.
- Synthetic and Kiro providers: kept the Windows-compatible provider rollout.
  Kiro was implemented here instead of importing the upstream placeholder shape.
- Alibaba provider: implemented as Windows experimental with region-aware auth
  rather than leaving the upstream-incompatible placeholder state.
- Claude rate-limit and Claude Design metric work: retained the safe plugin
  behavior and tests where it fits the Windows provider implementation.
- Codex plan-label fixes: accepted the Pro 5x/10x label mapping.
- Settings plugin-toggle test fix: accepted the Base UI checkbox double-fire
  regression coverage.
- Provider documentation: added provider docs for Abacus, Alibaba, Claude OAuth,
  Kiro, Zed, and proxy configuration in the Windows fork's documentation set.
- Delivered provider icons: replaced generic placeholders where the fork already
  has usable provider-specific assets.

## Skipped intentionally

- Upstream version bumps to `0.6.x`: skipped because this fork is on the
  independent Windows beta version line (`0.1.0-beta.x`).
- Official-app identifiers, release automation, and release-tag skill changes:
  skipped because this repo publishes and packages independently.
- `typescript` 6, `lucide-react` 1.x, and some other upstream dependency bumps:
  skipped for now to avoid introducing toolchain churn into the Windows beta.
- macOS-specific WKPreferences scheduling policy changes: skipped because they
  do not apply to this Windows tray branch.
- Cmd-arrow tab navigation: skipped because this branch uses Windows-first
  settings and tray navigation conventions.
- Upstream-only agent instruction files (`CLAUDE.md`, upstream `AGENTS.md`
  refresh): skipped where they conflict with this fork's Windows build notes.
- Star-history and repository presentation changes for the official repo:
  skipped because they are not product behavior for this fork.

## Follow-up watchlist

- Revisit the TypeScript and icon dependency bumps once the Windows beta is
  stable and CI can cover the migration.
- Keep comparing future upstream provider fixes against this document before
  importing them; provider auth code often needs Windows credential-store
  adaptation.
- If the official repo changes the plugin schema again, port the schema changes
  first, then provider plugins.

## Git history note

After the selected ports are committed, this fork can record `upstream/main` as
reviewed with a content-preserving merge commit. That commit should use the
current Windows tree as the source of truth and should not import upstream files
blindly. This keeps GitHub from reporting the fork as simply behind while still
making the review decision explicit.
