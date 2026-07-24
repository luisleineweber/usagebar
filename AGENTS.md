# AGENTS.md

## Project

- Contact: Luis Leineweber (@luisleineweber).
- Goal: Windows-first Tauri menu-bar/tray app for tracking AI coding subscription usage.
- Stack: Tauri v2, Rust, React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Vitest.
- Architecture: plugin-first; keep UX simple and changes small/reviewable.
- Fork lineage: `openusage`; Windows work also draws from `CodexBar`; local Claude/Codex usage reference is `ccusage`.
- “Make a note” means edit this file. Ignore `CLAUDE.md`; it is a symlink target for this file.
- Editor: `cursor <path>`.

## Start of Task

1. Read this file and summarize the relevant project context in-thread.
2. Read `tasks/lessons.md`; create it if missing.
3. Read or create `tasks/todo.md`. For non-trivial work, add acceptance criteria and a short testable plan before coding.
4. For work outside the active skill set, search for a relevant skill before substantial implementation.
5. Run a relevant baseline check when safe: targeted test, build, typecheck, or environment sanity check.
6. State when the environment is ready before substantial work.

## Working Rules

- Fix root causes; avoid band-aids, speculative fallbacks, and unnecessary features.
- For bugs, reproduce the failure with a focused test or deterministic check before implementing the smallest root-cause fix.
- Add regression coverage for core logic and bugs when practical.
- Keep files near 400 lines or less; split focused helpers when approaching the limit.
- Preserve unrelated user changes. Stop and ask only when an unrecognized change directly conflicts with the requested work.
- Do not delete, reset, clean, restore, or overwrite user data without explicit approval. Use `trash` for approved deletes and `mv`/`cp` for moves/copies.
- Do not create commits, change branches, push, or publish unless explicitly requested.
- commit format: `type(scope): short imperative description`
- After three failed attempts at the same test/build/lint/blocker, stop and report the blocker with a recommended alternative.

## Communication

- Begin work updates with `Executive Summary`: a few short bullets describing behavior, intent, and scope for a non-technical reader.
- Then provide the technical plan when the task has three or more meaningful steps.
- Lead with outcomes. Use concise, precise language; avoid filler.
- Do not ask whether to continue. Continue within scope unless the user says stop or progress is genuinely blocked.
- If choosing an opinionated default, record it in `docs/choices.md` with the date.
- Record meaningful investigation breadcrumbs in `docs/breadcrumbs.md`, appended under the current date.

## Research and Skills

- Prefer an applicable installed skill over ad-hoc research. Search for a skill when the task is outside the active project skills.
- For unstable, niche, external, or high-stakes facts, research authoritative current sources before implementation.
- Quote exact errors when useful; distinguish source-backed facts, local evidence, inference, and unresolved blockers.
- New dependencies require a quick health check: maintenance, recent releases/commits, and adoption.

## Error Handling

- Expected domain failures use explicit result types; do not use exceptions as ordinary control flow.
- External systems such as Git, GitHub, and React Query mutations may use exceptions where required by their APIs.
- Unexpected failures must be visible: throw or log with an appropriate user-facing error/toast. Do not silently fall back.

## Git and GitHub

- Use normal `git` commands for local status, diffs, history, and file work.
- Use `gh` for GitHub issues, pull requests, checks, releases, and comments.
- Use conventional branch prefixes: `feat`, `fix`, `refactor`, `build`, `ci`, `chore`, `docs`, `style`, `perf`, `test`.
- Keep changes small and reviewable; one concept per slice.
- Before a PR, run `bun run test:coverage`; required coverage gates must pass or the documented project waiver must apply.
- Review substantial changes with `git --no-pager diff --color=never` and `git diff --check`.

## Verification and Completion

- Verification order: focused tests/checks, related suite, full checks/build, formatting/lint, diff review.
- Record exact commands, outcomes, and pre-existing blockers in `tasks/todo.md`.
- Mark todo items complete only after their acceptance criteria are verified.
- Every bug fix or user correction gets a concise entry in `tasks/lessons.md`: what went wrong, the fix, and a prevention rule.
- For provider/plugin work, verify source tests, manifest, documentation, redaction obligations, and synchronized bundled resources.
- Distinguish fixture/mock coverage, local browser verification, packaged Windows verification, and real-account/provider verification.

## Provider and Plugin Rules

- Plugin SVG logos must use `currentColor`.
- `plugin.json` `brandColor` must use the provider’s real brand color.
- Audit plugin-exposed request/response fields against redaction lists in `src-tauri/src/plugin_engine/host_api.rs`; add tests for gaps.
- After plugin changes, run `bun run bundle:plugins` and verify source/bundled files are synchronized.
- Do not infer zero, Free, quota limits, subscription state, or metric labels from missing or ambiguous data; preserve unknown state and require authoritative provider evidence.

## Release

- Update `CHANGELOG.md` with the exact release version before tagging, publishing, or final release preflight.
- Before publishing or editing a release body, run `gh release view <previous-tag> --json body` and mirror its structure:
  - `What's Changed`
  - notable commits as `- Human summary by @luisleineweber in shortsha`
  - `Alpha Notes`
  - `New Contributors`
  - `Full Changelog: https://github.com/luisleineweber/usagebar/compare/<previous-tag>...<new-tag>`
- Never leave `Full Changelog` as plain tag names.
- Before a PR or release, ensure `README.md` lists supported plugins.

## User Notes

- Tauri IPC: JavaScript uses camelCase (`{ batchId, pluginIds }`); Tauri converts to Rust snake_case. Never send snake_case from JavaScript.
- Vercel AI Gateway: use one project API key, not individual provider keys.
- Convex verification: run `bunx convex dev --once`, not `bunx convex codegen`.
- Parallel `tauri-action` matrix builds are safe; the action merges existing `latest.json` platform entries.
- Windows is localized in German. Use locale-stable columns, flags, structured output, or path/process evidence; do not parse English-only tokens such as `LISTENING`.
