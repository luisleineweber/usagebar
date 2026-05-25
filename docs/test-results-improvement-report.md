# Test Results Improvement Report

Date: 2026-05-24 (updated)

## Executive Summary

- Test count improved materially: 84 test files, 1317 tests (up from 77 files / 1162 tests).
- Functions coverage now exceeds the 90% release gate.
- Lines coverage is almost there but still fails by 0.01% in the current strict run.
- Statements (86.69%) and Branches (80.20%) remain below 90%, primarily due to low coverage in plugin files (opencode, opencode-go, codebuff, etc.).
- 7 new test files added, 3 existing test files expanded. 84 test files, 1317 tests (up from 77 files / 1162 tests).
- Alpha 3 is still not release-ready under the current strict coverage gate.

## Current State

Latest release-prep result:

- Test execution: passed, 84 files / 1317 tests.
- Coverage gate: **FAILED**.
- Statements: 86.69% / required 90% (+1.39% from 85.30%).
- Branches: 80.20% / required 90% (+1.53% from 78.67%).
- Functions: 93.40% / required 90% (+2.44% from 90.96%).
- Lines: 89.99% / required 90% (+1.34% from 88.65%).

Important distinction: the suite is behavior-green, but release-blocked by coverage policy. Functions pass; lines are 0.01% short; statements and branches are still materially short.

## Changes Made

### New Test Files Added

| File                                                      | Tests | What it covers                                                                                                                                                                                                                               |
| --------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/error-utils.test.ts`                             | 15    | `getErrorMessage` for strings, Error instances, objects, null/undefined, edge cases                                                                                                                                                          |
| `src/lib/provider-settings.test.ts`                       | 70    | `getProviderSettingsDefinition`, `normalizeProviderConfigs`, `updateProviderConfig`, `setProviderSecretMetadata`, `clearProviderSecretMetadata`, `hasProviderSecret`, `getProviderSourceLabel`, `loadProviderConfigs`, `saveProviderConfigs` |
| `src/lib/codex-accounts.test.ts`                          | 3     | `listCodexAccountProfiles`, `importCurrentCodexAccountProfile`, `deleteCodexAccountProfile` (invoke wrappers)                                                                                                                                |
| `src/lib/provider-secrets.test.ts`                        | 2     | `setProviderSecret`, `deleteProviderSecret` (invoke wrappers)                                                                                                                                                                                |
| `src/lib/panel-window.test.ts`                            | 2     | `showPanelForView`, `syncPanelView` (invoke wrappers)                                                                                                                                                                                        |
| `src/components/settings/codex-accounts-section.test.tsx` | 15    | Profile loading, import, selection, deletion, error states, stale profile cleanup                                                                                                                                                            |
| `src/hooks/app/use-provider-statuses.test.ts`             | 7     | Status fetching, eligible plugin filtering, null handling, interval registration                                                                                                                                                             |

### Expanded Test Files

| File                                                 | Tests added | What was added                                                                                                                              |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/provider-status.test.ts`                    | +23         | `hasProviderStatusIssue`, full `providerStatusLabel` branches, `normalizeStatusPageUrl` edge cases, `fetchProviderStatus` with mocked fetch |
| `src/lib/utils.test.ts`                              | +7          | `formatCountNumber`, `formatFixedPrecisionNumber` including non-finite edge cases                                                           |
| `src/lib/settings.test.ts`                           | +4          | `loadTimeFormatMode`, `saveTimeFormatMode` with invalid fallback                                                                            |
| `src/hooks/app/use-settings-display-actions.test.ts` | +4          | `handleTimeFormatModeChange`, `handleMenubarIconStyleChange`, error logging                                                                 |

### Per-File Coverage Improvements

| File                                                 | Before | After  | Notes                                                   |
| ---------------------------------------------------- | ------ | ------ | ------------------------------------------------------- |
| `src/lib/error-utils.ts`                             | 54.5%  | ~100%  | All branches and edge cases tested                      |
| `src/lib/provider-status.ts`                         | 44.4%  | ~100%  | Including fetch, indicator normalization, null handling |
| `src/lib/provider-settings.ts`                       | 44.6%  | 98.85% | 70 tests covering all exported functions                |
| `src/lib/codex-accounts.ts`                          | 33.3%  | ~100%  | Simple invoke wrapper functions                         |
| `src/lib/provider-secrets.ts`                        | 0%     | ~100%  | Simple invoke wrapper functions                         |
| `src/lib/panel-window.ts`                            | 50%    | ~100%  | Simple invoke wrapper functions                         |
| `src/lib/settings.ts`                                | 95.45% | 98.86% | Added time format mode load/save/fallback               |
| `src/hooks/app/use-provider-statuses.ts`             | 75%    | ~95%   | Hook logic, eligibility, error paths                    |
| `src/hooks/app/use-settings-display-actions.ts`      | 61.1%  | ~86%   | Time format and menubar icon handlers                   |
| `src/components/settings/codex-accounts-section.tsx` | 33.3%  | 95.71% | Full management UI coverage                             |
| `src/lib/utils.ts`                                   | 93.75% | ~100%  | formatCountNumber/fixedPrecisionNumber                  |

## Remaining Gap Analysis

The remaining gap to 90% for statements (3.31% = 340 statements), branches (9.80% = 842 branches), and lines (0.01% = 1 line) is concentrated in plugin files:

| Plugin             | Statements | Branches | Uncovered statements (est.) |
| ------------------ | ---------- | -------- | --------------------------- |
| opencode           | 63.5%      | 59.34%   | ~110                        |
| opencode-go        | 68.6%      | 62.11%   | ~95                         |
| codebuff           | 74.26%     | 74.41%   | ~40                         |
| alibaba            | 77.46%     | 75.0%    | ~35                         |
| others (15+ files) | varies     | varies   | ~60                         |

These are large IIFE-based JS files where each test requires understanding the provider's API contract. The source code path tests (non-plugin) in `src/` are at 97.16% statements, 93.72% branches — already well above 90%.

## Recommendations

1. Keep the strict 90% release gate unchanged unless the release policy is explicitly changed.
2. Add a very small line-coverage test first to remove the 0.01% line blocker.
3. To reach 90% statements: add focused tests for the top 5 plugin files (opencode, opencode-go, codebuff, alibaba, etc.).
4. Branch coverage will need explicit edge-case tests; it will not close from happy-path plugin tests alone.
5. The `src/lib` directory is now at 97.16% statements, demonstrating the core library is well-tested.

## Rollout Progress

- [x] Step 1-3: Tooling (json-summary reporter, coverage-summary.mjs, run-coverage-report.mjs) — already in place from prior work.
- [x] Step 4: Package scripts in package.json — already in place.
- [x] Step 5: Add `test:coverage:report` and `test:coverage:summary`.
- [x] Steps 6-7: Targeted tests for priority debt files (provider-settings, provider-status, error-utils, codex-accounts-section, etc.).
- [x] Step 8: Reached 90% functions.
- [ ] Future: Close the remaining 0.01% line coverage gap.
- [ ] Future: Plugin file statement/branch coverage to close remaining gap.
