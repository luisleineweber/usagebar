import { spawn } from "node:child_process"
import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..")
const args = process.argv.slice(2)
const env = { ...process.env }
const envPath = path.join(repoRoot, ".env")
const bundleDir = path.join(repoRoot, "src-tauri", "target", "release", "bundle")

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/u)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue
    }

    const eqIndex = trimmed.indexOf("=")
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }
}

const signingKeyValue = env.TAURI_SIGNING_PRIVATE_KEY
if (signingKeyValue && existsSync(signingKeyValue)) {
  try {
    if (statSync(signingKeyValue).isFile()) {
      env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(signingKeyValue, "utf8")
    }
  } catch {
    // Keep the original value if it is not a readable file path.
  }
}

const resolvedArgs = [...args]
if (!env.TAURI_SIGNING_PRIVATE_KEY && !resolvedArgs.includes("--no-sign")) {
  resolvedArgs.push("--no-sign")
  console.log("No TAURI_SIGNING_PRIVATE_KEY found; building unsigned local artifacts with --no-sign.")
}

rmSync(bundleDir, { recursive: true, force: true })

const child = spawn(
  process.execPath,
  [path.join(repoRoot, "scripts", "tauri", "wrapper.mjs"), "build", ...resolvedArgs],
  {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  }
)

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  const artifactDirs = [
    path.join(bundleDir, "nsis"),
    path.join(bundleDir, "msi"),
    path.join(bundleDir, "app"),
    path.join(bundleDir, "dmg"),
    path.join(bundleDir, "macos"),
  ].filter((dir) => existsSync(dir))

  if (code === 0) {
    console.log("")
    console.log("Build complete. Artifacts:")
    for (const dir of artifactDirs) {
      console.log(`- ${path.relative(repoRoot, dir)}`)
    }
  }

  process.exit(code ?? 0)
})

child.on("error", (error) => {
  console.error("Failed to launch Tauri release build:", error)
  process.exit(1)
})
