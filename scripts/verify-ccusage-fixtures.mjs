import { readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "ccusage")
const hostSource = readFileSync(
  path.join(repoRoot, "src-tauri", "src", "plugin_engine", "ccusage_host_api.rs"),
  "utf8"
)
const version = hostSource.match(/const CCUSAGE_VERSION: &str = "(\d+\.\d+\.\d+)";/)?.[1]
if (!version) throw new Error("could not read CCUSAGE_VERSION from ccusage_host_api.rs")
const since = "20260801"
const until = "20260804"
const runner = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npx"

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, relativePath), "utf8"))
}

function lastJsonObject(stdout) {
  const trimmed = stdout.trim()
  for (
    let index = trimmed.lastIndexOf("{");
    index >= 0;
    index = trimmed.lastIndexOf("{", index - 1)
  ) {
    try {
      const value = JSON.parse(trimmed.slice(index))
      if (value && typeof value === "object" && !Array.isArray(value)) return value
    } catch {
      continue
    }
  }
  throw new Error("ccusage did not emit a JSON object")
}

function runFixture({ provider, envName, relativeHome, expectedPath }) {
  const home = path.join(fixtureRoot, relativeHome)
  const commandArgs = [
    "--yes",
    `ccusage@${version}`,
    provider,
    "daily",
    "--json",
    "--order",
    "desc",
    "--since",
    since,
    "--until",
    until,
    "--offline",
    "--timezone",
    "UTC",
  ]
  const result = spawnSync(
    runner,
    process.platform === "win32"
      ? ["/d", "/s", "/c", ["npx.cmd", ...commandArgs].join(" ")]
      : commandArgs,
    {
      cwd: repoRoot,
      env: { ...process.env, [envName]: home },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${provider} fixture query failed (${result.status}): ${result.stderr.trim()}`)
  }

  const actual = { daily: lastJsonObject(result.stdout).daily }
  const expected = readJson(expectedPath)
  const actualText = JSON.stringify(actual)
  const expectedText = JSON.stringify(expected)
  if (actualText !== expectedText) {
    throw new Error(
      `${provider} normalized daily output differs\nexpected: ${expectedText}\nactual:   ${actualText}`
    )
  }
  console.log(`${provider} fixture passed with ccusage@${version}`)
}

runFixture({
  provider: "codex",
  envName: "CODEX_HOME",
  relativeHome: "codex",
  expectedPath: "expected/codex.daily.json",
})
runFixture({
  provider: "opencode",
  envName: "OPENCODE_DATA_DIR",
  relativeHome: "opencode",
  expectedPath: "expected/opencode.daily.json",
})
