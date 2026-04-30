import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { cleanupStaleDebugBuildMetadata, getTauriChildEnv } from "./wrapper-lib.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..", "..")
const args = process.argv.slice(2)

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function getWindowsDevExeNames() {
  const names = new Set(["openusage"])
  const configPath = path.join(repoRoot, "src-tauri", "tauri.conf.json")

  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"))
    if (typeof config.productName === "string" && config.productName.trim()) {
      names.add(config.productName.trim().toLowerCase().replace(/\s+/g, "-"))
    }
  } catch {
    // Fall back to the legacy executable name if the config cannot be read.
  }

  return [...names].map((name) => `${name}.exe`)
}

function stopStaleWindowsDevProcess() {
  const exePaths = getWindowsDevExeNames().map((exeName) =>
    path.join(repoRoot, "src-tauri", "target", "debug", exeName)
  )
  const command = `
$repoExes = @(${exePaths.map(quoteForPowerShell).join(", ")}) | ForEach-Object { [System.IO.Path]::GetFullPath($_) }
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -and ($repoExes -contains [System.IO.Path]::GetFullPath($_.ExecutablePath)) } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
    Write-Output ("Stopped stale UsageBar dev process PID " + $_.ProcessId)
  }
`.trim()

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  )

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status)
  }
}

function clearStaleWindowsDebugMetadata() {
  const result = cleanupStaleDebugBuildMetadata(repoRoot)

  if (!result.removed) {
    return
  }

  const [firstEntry] = result.staleEntries
  console.log(
    `Removed stale Cargo/Tauri debug metadata copied from another repo path (${firstEntry.outputDir}).`
  )
}

function resolveTauriCli() {
  const packagedCli = path.join(repoRoot, "node_modules", "@tauri-apps", "cli", "tauri.js")
  if (existsSync(packagedCli)) {
    return {
      command: process.execPath,
      args: [packagedCli, ...args],
    }
  }

  const binDir = path.join(repoRoot, "node_modules", ".bin")
  const localBinary = process.platform === "win32"
    ? path.join(binDir, "tauri.cmd")
    : path.join(binDir, "tauri")

  if (existsSync(localBinary)) {
    if (process.platform === "win32" && localBinary.endsWith(".cmd")) {
      return {
        command: localBinary,
        args,
        spawnOptions: {
          shell: true,
        },
      }
    }

    return { command: localBinary, args }
  }

  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["@tauri-apps/cli", ...args],
  }
}

if (process.platform === "win32" && args[0] === "dev") {
  clearStaleWindowsDebugMetadata()
  stopStaleWindowsDevProcess()
}

const tauriCli = resolveTauriCli()
const child = spawn(tauriCli.command, tauriCli.args, {
  cwd: repoRoot,
  env: getTauriChildEnv(args),
  stdio: "inherit",
  ...(tauriCli.spawnOptions ?? {}),
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on("error", (error) => {
  console.error("Failed to launch Tauri CLI:", error)
  process.exit(1)
})
