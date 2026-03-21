# AGENTS.md

Version: 0.27 (2026-03-21)

Start: say hi + 1 motivating line.
Work style: radically precise. no fluff. pure information only.

## Project Snapshot
- Product: `UsageBar`, a Windows-first tray app for tracking AI coding subscription usage across AI providers in one place.
- Lineage: fork of `robinebers/openusage`; keep upstream lineage visible, but optimize for this fork's product direction.
- Stack: Tauri v2, Rust, React 19, TypeScript, Vite 7, Tailwind CSS v4, Zustand 5, Vitest 4.
- Architecture: plugin-first provider model, simple tray UX, small reviewable slices.
- Repo reality: user-facing branding is `UsageBar`, but some package/app internals still use `openusage`.

## Repo Pointers
- Contact: Robin Ebers (`@robinebers`, `rob@robinebers.com`).
- Workspace root: `D:\UsageBar\usagebar`.
- Upstream repo: `https://github.com/robinebers/openusage`.
- Windows reference repo: `D:\UsageBar\codexbar`.
- Editor: `cursor <path>`.
- "Make a note" means edit `AGENTS.md`. Ignore `CLAUDE.md`; it is a symlink mirror.
- Placeholders marked `--- Enter ... ---` are safe to replace without asking. Remove them once filled.

## Session Start Checklist
1. Read this file before significant work.
2. Summarize the project goal + stack in-thread.
3. Review `tasks/lessons.md`; create it if missing.
4. Review `tasks/todo.md`; create it if missing with the first 3 concrete steps.
5. Run `$find-skills <keywords>` before substantial work outside the active skill set.
6. Run a basic environment sanity check relevant to the task when safe (`Get-ChildItem`, `git status`, targeted test/build, or similar).
7. Confirm in-thread that the environment/context is ready before the first substantial implementation step.

## Planning And Execution
- Always create a spec in-memory before editing, even if minimal.
- Non-trivial work starts with:
  1. `Executive Summary`: short non-technical bullets covering intent and user-visible outcome.
  2. `Technical Plan`: concrete implementation steps.
- For non-trivial work, update `tasks/todo.md` before major edits:
  - add acceptance criteria
  - add a short testable plan
  - mark `[ ]` -> `[x]` only after verification
- If new information invalidates the plan, stop and re-plan immediately.
- Work in small, shippable slices. One concept per change package.
- Fix root cause, not symptoms.
- If unsure, read more code first. If still blocked, ask one short blocking question with the best default.
- After 3 failed attempts on the same blocker, stop and ask for a different path.

## Research And Skills
- Prefer local repo evidence first.
- Prefer skills over ad hoc research when a skill matches the task.
- If external research is still needed, browse early and use current 2025-2026 sources when available.
- Quote exact errors when searching.
- Active skills for this repo:
  - `find-skills`
  - `tauri-development`
  - `tauri-v2`
  - `frontend-design`
  - `web-design-guidelines`
  - `ui-ux-audit`
- Use these skills when they clearly match:
  - Web UI implementation or redesign -> `$frontend-design`
  - Web accessibility/guideline review -> `$web-design-guidelines`
  - UX flow/usability review -> `$ui-ux-audit`
  - Convex work -> `$convex`
- New dependencies need a quick health check: recent releases/commits, adoption, obvious maintenance risk.
- When asked to update `AGENTS.md` to the latest version:
  1. Fetch `https://raw.githubusercontent.com/robinebers/agents.md/main/AGENTS.md`.
  2. Check whether it is newer.
  3. Merge it without losing local repo-specific rules.

## Default Commands
- Prefer `bun` for JS scripts in this repo.
- Frontend dev: `bun run dev`
- Desktop dev: `bun run tauri dev`
- Frontend build: `bun run build`
- Frontend tests: `bun run test -- <path>` or `npx vitest run <path>`
- Coverage gate before PR: `bun run test:coverage`
- Tauri wrapper tests: `node --test scripts/tauri/wrapper.test.mjs`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml <filter>`
- Rust check: `cargo check --manifest-path src-tauri/Cargo.toml`
- GitHub/PR/CI/releases: `gh ...`

## Guardrails
- Use `trash` for deletes.
- Use `mv` / `cp` for moves and copies.
- Never delete files, folders, or user data unless explicitly approved or clearly covered by the written plan.
- Keep files under about 400 LOC when reasonable; split/refactor when that improves reviewability.
- Bugs: add a regression test when it clearly fits.
- Core logic changes: add at least one focused test when practical.
- Simplicity first. Handle important cases; avoid enterprise-style over-design.
- New functionality should be small or clearly necessary.
- Never add silent fallbacks for unexpected failures.
- Unrecognized worktree changes: assume another agent or the user. Do not revert them unless explicitly asked.

## Plugin And Provider Rules
- Provider/plugin changes must stay plugin-first; do not hardcode provider-specific behavior into the shell unless there is no better boundary.
- Before creating a PR or pushing to `main`, update `README.md` if supported providers changed.
- On any plugin change or new plugin:
  - audit plugin-exposed request/response fields against `src-tauri/src/plugin_engine/host_api.rs` redaction lists
  - add or update tests for any redaction gaps
  - compare with existing plugins for patterns before inventing new host/plugin shapes
- In `plugin.json`, set `brandColor` to the provider's real brand color.
- Provider SVG logos must use `currentColor`.

## Git And GitHub
- Use `gh` for GitHub communication. Prefer `gh` over browser searching for PRs/issues/releases.
- Safe by default: `git status`, `git diff`, `git log`.
- Big review command: `git --no-pager diff --color=never`.
- Do not create commits unless the user explicitly asks.
- Do not push unless the user explicitly asks.
- Branch changes require user consent.
- Prefer conventional branch names: `feat|fix|refactor|build|ci|chore|docs|style|perf|test`.
- Keep feature branches rebased onto the target branch before merge.
- `git checkout` is allowed for explicit requests or PR review.
- Avoid manual `git stash`; if Git auto-stashes during pull/rebase, that is acceptable.
- Destructive Git/file ops are forbidden unless explicit: `reset --hard`, `clean`, `restore`, `rm`, repo-wide search/replace scripts, or similar.

## Error Handling And Compatibility
- Expected issues: use explicit result types instead of broad `throw` / `try-catch`.
- Exceptions:
  - external systems (`git`, `gh`) may use `try-catch`
  - React Query mutations may throw
- Unexpected issues: fail loud with precise logs and visible UI errors; do not hide them behind fallback states.
- Local/uncommitted compatibility: none required; rewrite as if fresh.
- Changes already in `main`: likely need compatibility; ask the user if the tradeoff is unclear.

## Documentation And Memory
- `tasks/todo.md`: active plan, acceptance criteria, verification notes.
- `tasks/lessons.md`: every bug fix or user correction goes here before the related todo item is marked done.
- `docs/choices.md`: record opinionated defaults while working. Append under the current date.
- `docs/breadcrumbs.md`: leave short factual breadcrumbs for meaningful slices. Append under the current date.
- Keep notes factual, short, and specific enough to help the next slice.

## Completion Gate
- Assume `continue` unless the user explicitly says `stop` or `pause`.
- Do not ask `should I continue?`.
- Before ending a turn or asking a question, check privately:
  1. Was the initial task fully completed?
  2. Was every requested verification run or explicitly called out as not run?
  3. Is a question truly blocking?
  4. Can a reasonable default unblock progress?
- If a reasonable default exists, choose it, record it in `docs/choices.md`, and continue.
- If you must ask the user, ask exactly one blocking question, explain why it blocks, and state the default you would take otherwise.

## Project Notes
- This repo is a fork of `openusage`: `https://github.com/robinebers/openusage`.
- Windows transformation work has used `CodexBar` as a reference: `D:\UsageBar\codexbar`.
- Claude/Codex local usage reference: `ccusage`: `https://github.com/ryoppippi/ccusage`.
- Use a single Vercel AI Gateway API key across the project when that gateway is involved.
- For Convex verification, use `bunx convex dev --once`, not `bunx convex codegen`.

## User Notes
- Tauri IPC: JS must send camelCase (`{ batchId, pluginIds }`). Tauri maps to Rust snake_case automatically. Never send snake_case from JS.
- `tauri-action` `latest.json`: parallel matrix builds are safe; the action merges existing platform entries. No `max-parallel: 1` needed.
- User environment: Windows is localized in German. When parsing OS/process/network output, avoid English-only tokens such as `LISTENING`; prefer locale-stable columns, flags, structured output, or path/process evidence.
