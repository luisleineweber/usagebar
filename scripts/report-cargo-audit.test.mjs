import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const scriptPath = path.join(import.meta.dirname, "report-cargo-audit.mjs")

function runReport(report) {
  const reportPath = path.join(mkdtempSync(path.join(tmpdir(), "cargo-audit-")), "report.json")
  writeFileSync(reportPath, JSON.stringify(report))
  return spawnSync(process.execPath, [scriptPath, reportPath], { encoding: "utf8" })
}

const unmaintainedWarning = {
  advisory: { id: "RUSTSEC-2024-0370", title: "proc-macro-error is unmaintained" },
  package: { name: "proc-macro-error", version: "1.0.4" },
}

const vulnerability = {
  advisory: { id: "RUSTSEC-2026-0346", title: "rustls vulnerability" },
  package: { name: "rustls", version: "0.23.45" },
  versions: { patched: [">=0.23.46"] },
}

test("warnings are reported without failing the audit", () => {
  const result = runReport({ vulnerabilities: { list: [] }, warnings: { unmaintained: [unmaintainedWarning] } })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /1 unmaintained/)
  assert.match(result.stdout, /RUSTSEC-2024-0370/)
})

test("vulnerabilities fail the audit", () => {
  const result = runReport({
    vulnerabilities: { list: [vulnerability] },
    warnings: { unmaintained: [unmaintainedWarning] },
  })

  assert.equal(result.status, 1)
  assert.match(result.stdout, /1 vulnerability, 1 unmaintained/)
})
