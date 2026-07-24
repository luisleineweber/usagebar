import { spawnSync } from "node:child_process"

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  })
}

// The global 90% threshold is intentionally report-only here while CI enforces
// the changed-production-file ratchet in coverage-summary.mjs.
const reportEnv = {
  ...process.env,
  USAGEBAR_COVERAGE_REPORT_ONLY: "1",
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
