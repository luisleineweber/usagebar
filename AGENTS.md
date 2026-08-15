# AGENTS.md

## Project

- Contact: Luis Leineweber (@luisleineweber).
- Goal: Windows-first Tauri menu-bar/tray app for tracking AI coding subscription usage.
- Stack: Tauri v2, Rust, React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Vitest.
- Architecture: plugin-first; keep UX simple and changes small/reviewable.
- Fork lineage: `openusage`; Windows work also draws from `CodexBar`; local Claude/Codex/Opencode usage reference is `ccusage`.
- “Make a note” means edit this file.
- Editor: `cursor <path>`.

## Luis' Wishes

- Don't use any form of plan mode, we preferer thinking into instant implementation

## Project-Rules

### Working Rules

- Fix root causes; avoid band-aids, speculative fallbacks, and unnecessary features.
- For bugs, reproduce the failure with a focused test or deterministic check before implementing the smallest root-cause fix.
- Add regression coverage for core logic and bugs when practical.
- Keep files near 400 lines or less; split focused helpers when approaching the limit.
- Preserve unrelated user changes. Stop and ask only when an unrecognized change directly conflicts with the requested work.
- Do not delete, reset, clean, restore, or overwrite user data without explicit approval. Use `trash` for approved deletes and `mv`/`cp` for moves/copies.

### Error Handling

- Expected domain failures use explicit result types; do not use exceptions as ordinary control flow.
- External systems such as Git, GitHub, and React Query mutations may use exceptions where required by their APIs.
- Unexpected failures must be visible: throw or log with an appropriate user-facing error/toast. Do not silently fall back.

## Universal-Rules

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Our design regulations are written down in @DESIGN.md
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- **UI descriptions:** Do not add subtitles, helper text, or descriptive copy beneath headings, labels, cards, or settings by default. Prefer one concise, self-explanatory heading or label. Only add supporting copy when the user explicitly asks for it or when it is necessary to prevent misunderstanding or error, and never use it to restate the heading.

### Committing

- Do not create commits, change branches, push, or publish unless explicitly requested.
- commit format: `type(scope): short imperative description`
- commits should be small and understandable

### ASD-STE100 Simplified Technical English

Always respond using ASD-STE100 Simplified Technical English. It is a controlled writing standard. Aerospace and defense groups made it. It helps people write clear technical text.

Key rules:
- **Use approved words only.** The standard gives a word list. Each word has one meaning.
- **Use one word for one idea.** Do not use two words for the same thing.
- **Write short sentences.** Use 20 words or less for instructions.
- **Use active voice.** Write "Turn the switch", not "The switch must be turned".
- **Write short paragraphs.** Keep one topic in each paragraph.

The goal is easy reading. Many readers are not native English speakers. Clear text helps them do the work in a safe and correct way

## Tools

- GitHub cli via `gh`
- CodeRabbit Cli via `coderabbit` - for Code-Reviews - only use from 200+ LOC
- Use subagents only for bounded investigation, review, or parallel comparison. Do not use them for small implementation tasks. Each subagent should return findings and a recommended next step.

## Skills
This is a reference for frequently used skills, but there are many more to explore if you don't find the perfect one for the task here.

- use `find-skills` for every more complicated Tasks that could require extra knowledge
- UI polish and visual quality: `impeccable`.
- Accessibility and responsive layout: `better-accessibility`, `better-layout`, `better-typography`.
- Architecture improvements: `codebase-design`, `improve-codebase-architecture`.
- Code review: `code-review`, `code-refactor-review`.
- Final cleanup: `zero-tech-debt`.

## Verification and Completion

- Verification order: focused tests/checks, related suite, full checks/build, formatting/lint, diff review.
- Every bug fix or user correction gets a concise entry in `tasks/lessons.md`: what went wrong, the fix, and a prevention rule.
- For provider/plugin work, verify source tests, manifest, documentation, redaction obligations, and synchronized bundled resources.
- Distinguish fixture/mock coverage, local browser verification, packaged Windows verification, and real-account/provider verification.

### Cross-Layer Change Audit

- Before editing, search every affected stable ID, display label, persisted value, runtime field, test helper, module mock, manifest, asset, CI command, and documentation reference.
- For usage data, define each state before coding: authoritative zero, unknown, missing, retained, unsupported, error, and inactive. Never use one state as another.
- After focused tests, run the real boundary check when relevant: Windows launcher, production runner command, Tauri native window, tray behavior, packaged build, or clean plugin bundle.
- Run frontend tests and typecheck with Rust tests, format, and lint after changes that cross the frontend/backend boundary.
- When changing visible text or interactions, update accessible-name tests, keyboard tests, navigation tests, and persisted-value migrations together.
- Every important local quality command needs a CI call site or a documented reason why it does not.
- Treat lessons as executable rules. Add a test, script, or CI check for repeated failures.


## Provider and Plugin Rules

- Plugin SVG logos must use `currentColor`.
- `plugin.json` `brandColor` must use the provider’s real brand color. Still keep an Eye out for visibility for light- and darkmode
- Audit plugin-exposed request/response fields against redaction lists in `src-tauri/src/plugin_engine/host_api.rs`; add tests for gaps.
- After plugin changes, run `bun run bundle:plugins` and verify source/bundled files are synchronized.
- Provider values need authoritative provenance. Do not infer zero, Free, quota, limits, subscription state, or metric labels from missing, local, stale, or ambiguous data.
- Provider changes must verify runtime mapping, TypeScript boundaries, fixtures, full and partial mocks, manifests, bundled resources, and documentation together.

## Release

- Full Release regulations are at "\docs\releasing.md"
- Update `CHANGELOG.md` with the exact release version before tagging, publishing, or final release preflight.
- Before publishing or editing a release body, run `gh release view <previous-tag> --json body` and mirror its structure:
  - `What's Changed`
  - every commit from `<previous-tag>..<new-tag>` as one bullet, using: if commit "[commit message]-[commit-tag] by @[author]" ; if merge "[pr title]-by @[author] in [pr-tag]"
  - `Alpha Notes`
  - `New Contributors`: "@[author] made their first contribution in [commit-tag/pr-tag]"
  - `Full Changelog: https://github.com/luisleineweber/usagebar/compare/<previous-tag>...<new-tag>`
- Never leave `Full Changelog` as plain tag names.
- Before a PR or release, ensure `README.md` lists supported plugins.

## User Notes

- Tauri IPC: JavaScript uses camelCase (`{ batchId, pluginIds }`); Tauri converts to Rust snake_case. Never send snake_case from JavaScript.
- Parallel `tauri-action` matrix builds are safe; the action merges existing `latest.json` platform entries.
