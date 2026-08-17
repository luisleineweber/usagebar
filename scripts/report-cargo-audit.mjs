import { readFileSync } from "node:fs"

const reportPath = process.argv[2]
if (!reportPath) {
  console.error("Usage: node scripts/report-cargo-audit.mjs <cargo-audit.json>")
  process.exit(2)
}

const data = JSON.parse(readFileSync(reportPath, "utf8").replace(/^\uFEFF/u, ""))
const entries = []

for (const entry of data.vulnerabilities?.list ?? []) {
  entries.push({ type: "vulnerability", entry })
}

for (const [type, warnings] of Object.entries(data.warnings ?? {})) {
  for (const entry of warnings ?? []) {
    entries.push({ type, entry })
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) ?? "unknown"
}

function packageName(entry) {
  return firstString(entry.package?.name, entry.advisory?.package, entry.name)
}

function packageVersion(entry) {
  return firstString(entry.package?.version, entry.version)
}

function advisoryId(entry) {
  return firstString(entry.advisory?.id, entry.id, entry.advisory?.aliases?.[0])
}

function advisoryUrl(entry) {
  return firstString(entry.advisory?.url, entry.url, entry.advisory?.references?.[0])
}

function severity(entry) {
  const cvss = entry.advisory?.cvss
  if (typeof cvss === "number" || typeof cvss === "string") return String(cvss)
  return firstString(entry.advisory?.severity, entry.advisory?.informational, entry.severity)
}

function patchedVersions(entry) {
  const versions = entry.versions?.patched ?? entry.advisory?.patched_versions
  if (!Array.isArray(versions) || versions.length === 0) return "none listed"
  return versions.join(", ")
}

function packageSource(entry) {
  return firstString(entry.package?.source, entry.source)
}

const counts = entries.reduce((result, { type }) => {
  result[type] = (result[type] ?? 0) + 1
  return result
}, {})
const countLabel = Object.entries(counts)
  .map(([type, count]) => `${count} ${type}`)
  .join(", ")

console.log("## RustSec dependency audit")
console.log("")
console.log(`**${entries.length} findings:** ${countLabel || "none"}.`)
console.log(`- Audit database updated: ${data.database?.["last-updated"] ?? "unknown"}`)
console.log(`- Lockfile dependencies: ${data.lockfile?.["dependency-count"] ?? "unknown"}`)
console.log("")

for (const { type, entry } of entries) {
  const id = advisoryId(entry)
  const url = advisoryUrl(entry)
  const title = firstString(entry.advisory?.title, entry.title)
  const heading = url ? `[${id}](${url})` : id

  console.log(`### ${heading} — ${packageName(entry)}@${packageVersion(entry)}`)
  console.log("")
  console.log(`- Type: ${type}`)
  console.log(`- Severity: ${severity(entry)}`)
  console.log(`- Advisory: ${title}`)
  console.log(`- Patched versions: ${patchedVersions(entry)}`)
  console.log(`- Package source: ${packageSource(entry)}`)
  console.log("")
}

process.exitCode = entries.length > 0 ? 1 : 0
