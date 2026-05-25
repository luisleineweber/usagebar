import { spawnSync } from "node:child_process"

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  })
}

const coverageResult = run("bun", ["vitest", "run", "--coverage.enabled"], {
  env: {
    ...process.env,
    USAGEBAR_COVERAGE_REPORT_ONLY: "1",
  },
})

const summaryResult = run("node", ["./scripts/coverage-summary.mjs"])

if (coverageResult.status !== 0) {
  process.exitCode = coverageResult.status ?? 1
} else if (summaryResult.status !== 0) {
  process.exitCode = summaryResult.status ?? 1
}
