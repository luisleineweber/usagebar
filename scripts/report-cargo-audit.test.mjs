import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "report-cargo-audit.mjs")

function runReport(report) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "usagebar-cargo-audit-"))
  const reportPath = path.join(dir, "cargo-audit.json")
  writeFileSync(reportPath, JSON.stringify(report))
  return spawnSync(process.execPath, [scriptPath, reportPath], { encoding: "utf8" })
}

const unmaintainedWarning = {
  kind: "unmaintained",
  package: { name: "proc-macro-error", version: "1.0.4" },
  advisory: { id: "RUSTSEC-2024-0370", title: "proc-macro-error is unmaintained" },
}

const vulnerability = {
  package: { name: "rustls", version: "0.23.0" },
  advisory: { id: "RUSTSEC-2024-0336", title: "Infinite loop in rustls", cvss: "7.5" },
}

test("warnings are reported without failing the audit", () => {
  const result = runReport({
    vulnerabilities: { list: [] },
    warnings: { unmaintained: [unmaintainedWarning] },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\*\*1 findings:\*\* 1 unmaintained\./)
  assert.match(result.stdout, /RUSTSEC-2024-0370/)
})

test("vulnerabilities fail the audit", () => {
  const result = runReport({
    vulnerabilities: { list: [vulnerability] },
    warnings: { unmaintained: [unmaintainedWarning] },
  })

  assert.equal(result.status, 1)
  assert.match(result.stdout, /RUSTSEC-2024-0336/)
})
