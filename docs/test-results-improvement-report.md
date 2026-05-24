# Test Results Improvement Report

Date: 2026-05-24

## Current State

`bun run test:coverage` is useful but not release-actionable enough.

Latest result:

- Test execution: passed, 77 files / 1162 tests.
- Coverage gate: failed.
- Statements: 85.3% / required 90%.
- Branches: 78.67% / required 90%.
- Functions: 90.96% / required 90%.
- Lines: 88.65% / required 90%.

The important distinction is hidden in the long coverage table: the suite is behavior-green, but release-blocked by global coverage thresholds.

## Problems

1. The script name implies a single test result, but the output mixes test pass/fail and coverage policy failure.
2. Coverage failure is global, so the output does not immediately show the best files to fix first.
3. New plugin/provider work can lower coverage even when focused tests are good, because low-coverage legacy files are included in the same aggregate.
4. There is no compact machine-readable summary committed or printed at the end.
5. Release prep currently needs manual interpretation of a large table.

## Recommended Changes

### 1. Add a Coverage Summary Script

Create `scripts/coverage-summary.mjs` that reads `coverage/lcov.info` or JSON coverage output and prints:

- tests passed/failed
- threshold pass/fail
- current global coverage
- distance to threshold
- lowest 10 files by lines/statements/branches
- files changed in the current branch with their coverage

This makes the next action obvious.

### 2. Emit JSON Coverage

Add `json-summary` to the Vitest coverage reporters:

```ts
reporter: ["text", "html", "lcov", "json-summary"]
```

Then `coverage/coverage-summary.json` can drive scripts, CI annotations, and release reports without parsing terminal output.

### 3. Split Test Commands By Intent

Keep the release gate strict, but add clearer scripts:

```json
"test:all": "vitest run",
"test:coverage:report": "USAGEBAR_COVERAGE_REPORT_ONLY=1 vitest run --coverage.enabled",
"test:coverage:gate": "vitest run --coverage.enabled",
"test:release": "bun run check && bun run test:coverage:gate && bun run release:check"
```

On Windows PowerShell, use a cross-platform env helper or a small Node wrapper instead of shell-specific env syntax.

### 4. Track Changed-File Coverage Separately

Do not weaken the global gate. Add a non-blocking changed-file report so a PR can say:

- changed files covered well
- global legacy debt still below threshold
- exact debt owners listed

This prevents new work from being blamed vaguely for old aggregate debt.

### 5. Add Coverage Debt Targets

Based on the latest output, first targets should be:

- `plugins/opencode/plugin.js`
- `plugins/opencode-go/plugin.js`
- `src/components/settings/provider-inputs-section.tsx`
- `src/lib/provider-settings.ts`
- `src/hooks/app/use-settings-tray-actions.ts`
- `src/lib/provider-status.ts`

These are low enough to move the global numbers faster than adding tests to already healthy files.

## Release Policy Recommendation

For Alpha 3, keep `bun run test:coverage` as a blocker because repo policy says coverage minimums must pass before PR/release. Do not lower thresholds during release prep.

The practical next slice is a coverage-focused PR:

1. Add `json-summary` reporter.
2. Add `scripts/coverage-summary.mjs`.
3. Add targeted tests for the six debt files above.
4. Re-run `bun run test:coverage`.
5. Only then tag Alpha 3.

