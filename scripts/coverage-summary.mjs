import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const THRESHOLD = 90
const CHANGED_FILE_THRESHOLD = 80
const SUMMARY_PATH = path.resolve("coverage", "coverage-summary.json")
const enforceChangedCoverage = process.env.USAGEBAR_COVERAGE_ENFORCE_CHANGED === "1"

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/")
}

function toRelativeCoveragePath(filePath) {
  const normalized = normalizePath(filePath)
  const cwd = normalizePath(process.cwd())
  return normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : normalized
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function getChangedFiles() {
  const branchFiles = runGit(["diff", "--name-only", "--diff-filter=ACMR", "origin/main...HEAD"])
  const diffFiles =
    branchFiles.length > 0
      ? branchFiles
      : runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])
  const untrackedFiles = runGit(["ls-files", "--others", "--exclude-standard"])

  return [...new Set([...diffFiles, ...untrackedFiles])]
}

function metricLine(label, metric) {
  const pct = Number(metric.pct)
  const status = pct >= THRESHOLD ? "pass" : `fail, ${formatPercent(THRESHOLD - pct)} short`
  return `- ${label}: ${formatPercent(pct)} (${metric.covered}/${metric.total}) ${status}`
}

function fileCoverageLine(entry, metricName = "lines") {
  const metric = entry.metrics[metricName]
  const branches = entry.metrics.branches
  const functions = entry.metrics.functions
  return `- ${formatPercent(metric.pct)} ${entry.file} (lines ${entry.metrics.lines.covered}/${entry.metrics.lines.total}, branches ${formatPercent(branches.pct)}, functions ${formatPercent(functions.pct)})`
}

function main() {
  if (!existsSync(SUMMARY_PATH)) {
    console.error(`Coverage summary not found: ${SUMMARY_PATH}`)
    console.error("Run `bun run test:coverage` or `bun run test:coverage:report` first.")
    process.exitCode = 1
    return
  }

  const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"))
  const total = summary.total
  const entries = Object.entries(summary)
    .filter(([file]) => file !== "total")
    .map(([file, metrics]) => ({
      file: toRelativeCoveragePath(file),
      metrics,
    }))

  const metrics = [
    ["Statements", total.statements],
    ["Branches", total.branches],
    ["Functions", total.functions],
    ["Lines", total.lines],
  ]
  const gatePassed = metrics.every(([, metric]) => Number(metric.pct) >= THRESHOLD)

  console.log("Coverage Summary")
  console.log("")
  console.log(`Gate: ${gatePassed ? "pass" : "fail"} (${THRESHOLD}% global threshold)`)
  for (const [label, metric] of metrics) {
    console.log(metricLine(label, metric))
  }

  const lowestByLines = entries
    .filter((entry) => entry.metrics.lines.total > 0)
    .sort((a, b) => a.metrics.lines.pct - b.metrics.lines.pct)
    .slice(0, 10)
  const lowestByBranches = entries
    .filter((entry) => entry.metrics.branches.total > 0)
    .sort((a, b) => a.metrics.branches.pct - b.metrics.branches.pct)
    .slice(0, 10)

  console.log("")
  console.log("Lowest Line Coverage")
  for (const entry of lowestByLines) {
    console.log(fileCoverageLine(entry, "lines"))
  }

  console.log("")
  console.log("Lowest Branch Coverage")
  for (const entry of lowestByBranches) {
    console.log(fileCoverageLine(entry, "branches"))
  }

  const byFile = new Map(entries.map((entry) => [normalizePath(entry.file), entry]))
  const changedFiles = getChangedFiles().map(normalizePath)
  const changedCoverage = changedFiles
    .map((file) => ({ file, entry: byFile.get(file) }))
    .filter(({ file }) => /^(src|plugins)\//.test(file))
    .filter(({ file }) => /\.(js|jsx|ts|tsx)$/.test(file))
    .filter(
      ({ file }) =>
        !file.endsWith(".test.js") && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx")
    )

  console.log("")
  console.log("Changed File Coverage")
  if (changedCoverage.length === 0) {
    console.log("- No changed production JS/TS files found.")
  } else {
    for (const { file, entry } of changedCoverage) {
      if (!entry) {
        console.log(`- missing ${file}`)
        continue
      }
      console.log(fileCoverageLine(entry, "lines"))
    }
  }

  if (enforceChangedCoverage) {
    const failedChangedCoverage = changedCoverage.filter(({ entry }) => {
      if (!entry) return true
      return Number(entry.metrics.lines.pct) < CHANGED_FILE_THRESHOLD
    })

    if (failedChangedCoverage.length > 0) {
      console.error("")
      console.error(`Changed-file coverage gate: fail (${CHANGED_FILE_THRESHOLD}% line threshold)`)
      for (const { file } of failedChangedCoverage) {
        console.error(`- ${file}`)
      }
      process.exitCode = 1
    } else {
      console.log("")
      console.log(`Changed-file coverage gate: pass (${CHANGED_FILE_THRESHOLD}% line threshold)`)
    }
  }
}

main()
