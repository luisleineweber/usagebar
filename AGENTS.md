# AGENTS.md

Version: 0.26 (2026-02-10)

Start: say hi + 1 motivating line.
Work style: Be radically precise. No fluff. Pure information only (drop grammar; min tokens).

## Project Summary
- Goal: cross-platform menu bar / tray app to track AI coding subscription usage across providers in one place.
- Stack: Tauri v2, Rust, React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Vitest.
- Constraints: plugin-first architecture, simple UX, small reviewable changes, Windows fork context while keeping upstream `openusage` lineage visible.

## Placeholder Policy
- Placeholders marked `--- Enter ... ---` are editable without asking first.
- On project start, replace placeholders with concrete repo details.
- Remove placeholder lines once real content is added.

## Agent Protocol
- Contact: Luis Leineweber (@loues000).
- “Make a note” => edit AGENTS.md (Ignore `CLAUDE.md`, symlink for AGENTS.md).
- Editor: `cursor <path>`.
- New deps: quick health check (recent releases/commits, adoption).

## Session Start Checklist
1. Read this file before significant work; summarize project goal + stack in-thread.
2. Review `tasks/lessons.md`; create it if missing.
3. Review `tasks/todo.md`; if missing create it with the first 3 concrete steps.
4. For stack/domain-specific work outside the active skill set, run `$find-skills <keywords>` before substantial implementation.
5. Run a basic environment sanity check relevant to the task (`ls`, targeted test, build, or similar) before major work when safe.
6. Confirm in-thread that the environment/context is ready before the first substantial task.

## Guardrails
- Use `trash` for deletes.
- Use `mv` / `cp` to move and copy files.
- Bugs: add regression test when it fits.
- Keep files <~400 LOC; split/refactor as needed.
- Simplicity first: handle only important cases; no enterprise over-engineering.
- New functionality: small OR absolutely necessary.
- NEVER delete files, folders or other data unless explicilty approved or part of a plan.
- Before writing code, stricly follow the blow research rules
- Always start with "Executive Summary" and summarize the plan for a non-technical reader in a few short bullets (what will change, behavior outcomes, intent, etc), avoiding jargon and implementation details. After that, show the full technical plan with details needed to implement.

## Research
- Always create a spec in-memory (no files), even if minimal
- Prefer skills if available over research
- Prefer researched knowledge over existing knowledge when skills are unavailable
- Research: Exa to websearch early, and Ref to seek specific documention or web fetch.
- Best results: Quote exact errors; prefer 2025-2026 sources.

## Git
- Always use `gh` to communicate with GitHub.
- GitHub CLI for PRs/CI/releases. Given issue/PR URL (or `/pull/5`): use `gh`, not web search.
- Examples: `gh issue view <url> --comments -R owner/repo`, `gh pr view <url> --comments --files -R owner/repo`.
- Conventional branches (`feat|fix|refactor|build|ci|chore|docs|style|perf|test`).
- Make changes in small, reviewable packages; one concept per package.
- Do not create commits unless the user explicitly asks.
- Safe by default: `git status/diff/log`. Push only when user asks.
- `git checkout` ok for PR review / explicit request.
- Branch workflow: keep feature branches rebased onto the target branch before merge.
- Branch changes require user consent.
- Destructive ops forbidden unless explicit (`reset --hard`, `clean`, `restore`, `rm`, …).
- No repo-wide S/R scripts; keep edits small/reviewable.
- Avoid manual `git stash`; if Git auto-stashes during pull/rebase, that’s fine (hint, not hard guardrail).
- If user types a command (“pull and push”), that’s consent for that command.
- Big review: `git --no-pager diff --color=never`.
- Before creating a PR, run `bun run test:coverage`; coverage minimums must pass.

## Error Handling
- Expected issues: explicit result types (not throw/try/catch).
  - Exception: external systems (git, gh) → try/catch ok.
  - Exception: React Query mutations → throw ok.
- Unexpected issues: fail loud (throw/console.error + toast.error); NEVER add fallbacks.

## Backwards Compat
- Local/uncommitted: none needed; rewrite as if fresh.
- In main: probably needed, ask user.

## Critical Thinking
- Fix root cause (not band-aid).
- Unsure: read more code; if still stuck, ask w/ short options (A/B/C).
- Conflicts: stop. call out; pick safer path.
- Unrecognized changes: assume other agent; keep going; focus your changes. If it causes issues, stop + ask user.
- Work in small, shippable slices.
- Prefer correctness + guardrails over more features.
- Ralph Wiggum Loop: after 3 failed attempts on the same task (tests/build/lint/blocker), stop and ask for a different path.

## Planning Default
- Non-trivial work (3+ steps, refactors, architectural changes) starts with a written plan before coding.
- Plan mode in this repo: create/update `tasks/todo.md`, keep steps short/testable, and track `[ ]` -> `[x]`.
- Write acceptance criteria in `tasks/todo.md` before implementation for non-trivial work.
- If new information invalidates the plan, stop and re-plan immediately.

## Subagent Strategy
- Use subagents liberally for research, parallel analysis, or exploration when helpful.
- Give each subagent one specific task.
- Subagent output should be short findings + recommended next step unless code is explicitly requested.

## Self-Improvement Loop
- Every bug fix or user correction must be appended to `tasks/lessons.md` before the related todo item is marked done.
- Record: what went wrong, the fix, and a concrete prevention rule.
- Review `tasks/lessons.md` at the start of each session before significant work.

## Completion and Autonomy Gate
- Assume "continue" unless the user explicitly says "stop" or "pause".
- Do not ask "should I continue?" or similar questions.
- If more progress is possible without user input, continue.
- BEFORE you end a turn or ask the user a question, run this checklist
-- Answer these privately, then act:
   1) Was the initial task fully completed?
   2) If a definition-of-done was provided, did you run and verify every item?
   3) Are you about to stop to ask a question?
      - If yes: is the question actually blocking forward progress?
   4) Can the question be answered by choosing an opinionated default?
      - If yes: choose a default, document it in , and continue.
- When you choose opinionated defaults, document them in `/docs/choices.md` as you work.
- Leave breadcrumb notes in thread and `/docs/breadcrumbs.md`.
- When writing to `/docs/choices.md` or `/docs/breadcrumbs.md` categorize by date (tail)
- If you must ask the user:
-- Ask exclusively blocking question only.
-- Explain why it is blocking and what you will do once answered.
-- Provide your best default/assumption as an alternative if the user does not care.

## Useful Tidbits
- When using Vercel AI Gateway, use a single API key across the project, not individual providers.
- When using Convex, run `bunx convex dev --once` to verify, not `bunx convex codegen`.

## Before Creating Pull Request
- Before creating a PR or pushing to main, ensure that `README.md` is updated with what plugins are supported.
- On any plugin change/new plugin, audit plugin-exposed request/response fields against `src-tauri/src/plugin_engine/host_api.rs` redaction lists and add/update tests for gaps. Compare with existing plugins for patterns.
- In `plugin.json`, set `brandColor` to the provider's real brand color.
- Plugin SVG logos must use `currentColor` so icon theming works correctly.

## Before Release
- Update `CHANGELOG.md` with a section for the exact release version before tagging, publishing, or running the final release preflight.

## Project Notes
- This repo is a fork of `openusage`: `https://github.com/robinebers/openusage`.
- Windows transformation work was helped by `CodexBar`: `https://github.com/steipete/CodexBar`.
- Claude/Codex local usage reference: `ccusage`: `https://github.com/ryoppippi/ccusage`.

## Skills Strategy
- Search-first: before work outside the core/active skill set, run `$find-skills <relevant keywords>`.
- Install/use skills just-in-time; keep active skills lean.
- Web UI implementation or redesign: use `$frontend-design`.
- Web accessibility/guideline review: use `$web-design-guidelines`.
- UX flow/usability review: use `$ui-ux-audit`.
- Convex work: use `$convex`.

### Active Skills For This Project
- `find-skills`
- `tauri-development`
- `tauri-v2`
- `frontend-design`
- `web-design-guidelines`
- `ui-ux-audit`

## Definition Of Done
- Do not mark a task done without verification: build, tests, logs, diff review, or a manual check that matches scope.
- Add at least one test when introducing core logic or when a regression test clearly fits.
- For provider/plugin changes, also verify related docs/redaction/test obligations in the existing PR checklist section.

## Task Management Protocol
1. Initialize: write/update the plan in `tasks/todo.md`.
2. Execute: mark items `[x]` only after verification.
3. Summarize: provide a short high-level summary when the slice is complete.
4. Lesson capture: if a bug or correction happened, document it in `tasks/lessons.md`.

## User Notes
Use below list to store and recall user notes when asked to do so.

- Tauri IPC: JS must use camelCase (`{ batchId, pluginIds }`), Tauri auto-converts to Rust's snake_case. Never send snake_case from JS—params silently won't match.
- tauri-action `latest.json`: Parallel matrix builds are safe—action fetches existing `latest.json`, merges platform entries, re-uploads. No `max-parallel: 1` needed.
- User environment: Windows is localized in German. When parsing OS/process/network command output, do not depend on English-only tokens like `LISTENING`; prefer locale-stable columns, flags, structured output, or path/process evidence.
