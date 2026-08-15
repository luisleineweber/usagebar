import { spawnSync } from "node:child_process"

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  })
}

// Global coverage stays visible as a report. Release and CI use the changed-file ratchet.
const reportEnv = {
  ...process.env,
  USAGEBAR_COVERAGE_REPORT_ONLY: "1",
  USAGEBAR_COVERAGE_ENFORCE_CHANGED: process.argv.includes("--enforce-changed") ? "1" : undefined,
}

const coverageResult = run("bun", ["vitest", "run", "--coverage.enabled"], {
  env: reportEnv,
})

const summaryResult = run("node", ["./scripts/coverage-summary.mjs"], {
  env: reportEnv,
})

if (coverageResult.status !== 0) {
  process.exitCode = coverageResult.status ?? 1
} else if (summaryResult.status !== 0) {
  process.exitCode = summaryResult.status ?? 1
}
