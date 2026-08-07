import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const THRESHOLD = 90
const CHANGED_FILE_THRESHOLD = 80
const SUMMARY_PATH = path.resolve("coverage", "coverage-summary.json")
const FINAL_PATH = path.resolve("coverage", "coverage-final.json")
const enforceChangedCoverage = process.env.USAGEBAR_COVERAGE_ENFORCE_CHANGED === "1"
const reportOnly = process.env.USAGEBAR_COVERAGE_REPORT_ONLY === "1"

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

function runGitRaw(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return ""
  }
}

function getChangedFiles() {
  const branchFiles = runGit(["diff", "--name-only", "--diff-filter=ACMR", "origin/main...HEAD"])
  const diffFiles = runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])
  const untrackedFiles = runGit(["ls-files", "--others", "--exclude-standard"])

  return [...new Set([...branchFiles, ...diffFiles, ...untrackedFiles])]
}

function addChangedLinesFromDiff(lines, diff) {
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    for (let line = start; line < start + count; line += 1) lines.add(line)
  }
}

function getChangedLines(file) {
  const lines = new Set()
  addChangedLinesFromDiff(
    lines,
    runGitRaw(["diff", "--unified=0", "--diff-filter=ACMR", "origin/main...HEAD", "--", file])
  )
  addChangedLinesFromDiff(
    lines,
    runGitRaw(["diff", "--unified=0", "--diff-filter=ACMR", "HEAD", "--", file])
  )
  if (runGit(["ls-files", "--others", "--exclude-standard", "--", file]).length > 0) {
    const lineCount = readFileSync(file, "utf8").split(/\r?\n/).length
    for (let line = 1; line <= lineCount; line += 1) lines.add(line)
  }
  return lines
}

function getExecutableLineCoverage(finalEntry) {
  const lines = new Map()
  for (const [id, location] of Object.entries(finalEntry.statementMap ?? {})) {
    const line = location.start.line
    const count = Number(finalEntry.s?.[id] ?? 0)
    lines.set(line, Math.max(lines.get(line) ?? 0, count))
  }
  return lines
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
  if (!existsSync(SUMMARY_PATH) || !existsSync(FINAL_PATH)) {
    console.error(`Coverage summary not found: ${SUMMARY_PATH}`)
    console.error("Run `bun run test:coverage` or `bun run test:coverage:report` first.")
    process.exitCode = 1
    return
  }

  const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"))
  const finalCoverage = JSON.parse(readFileSync(FINAL_PATH, "utf8"))
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
  const globalGateStatus = reportOnly ? "report-only" : gatePassed ? "pass" : "fail"
  console.log(`Global gate: ${globalGateStatus} (${THRESHOLD}% threshold)`)
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
  const finalByFile = new Map(
    Object.entries(finalCoverage).map(([file, coverage]) => [
      toRelativeCoveragePath(file),
      coverage,
    ])
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

  const changedLineCoverage = changedCoverage
    .map(({ file }) => {
      const executableLines = getExecutableLineCoverage(finalByFile.get(file) ?? {})
      const changedExecutableLines = [...getChangedLines(file)].filter((line) =>
        executableLines.has(line)
      )
      const covered = changedExecutableLines.filter((line) => executableLines.get(line) > 0).length
      return {
        file,
        covered,
        total: changedExecutableLines.length,
        pct:
          changedExecutableLines.length === 0
            ? 100
            : (covered / changedExecutableLines.length) * 100,
      }
    })
    .filter(({ total }) => total > 0)

  console.log("")
  console.log("Changed Line Coverage")
  if (changedLineCoverage.length === 0) {
    console.log("- No changed executable lines found.")
  } else {
    for (const entry of changedLineCoverage) {
      console.log(`- ${formatPercent(entry.pct)} ${entry.file} (${entry.covered}/${entry.total})`)
    }
  }

  if (enforceChangedCoverage) {
    const missingChangedCoverage = changedCoverage
      .filter(({ file }) => !finalByFile.has(file))
      .map(({ file }) => ({ file, pct: 0 }))
    const failedChangedCoverage = [
      ...changedLineCoverage.filter(({ pct }) => pct < CHANGED_FILE_THRESHOLD),
      ...missingChangedCoverage,
    ]

    if (failedChangedCoverage.length > 0) {
      console.error("")
      console.error(`Changed-line coverage gate: fail (${CHANGED_FILE_THRESHOLD}% threshold)`)
      for (const { file } of failedChangedCoverage) {
        console.error(`- ${file}`)
      }
      process.exitCode = 1
    } else {
      console.log("")
      console.log(`Changed-line coverage gate: pass (${CHANGED_FILE_THRESHOLD}% threshold)`)
    }
  }
}

main()
