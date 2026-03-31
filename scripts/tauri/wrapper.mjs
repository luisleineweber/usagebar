import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { cleanupStaleDebugBuildMetadata } from "./wrapper-lib.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..", "..")
const args = process.argv.slice(2)

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function stopStaleWindowsDevProcess() {
  const exePath = path.join(repoRoot, "src-tauri", "target", "debug", "openusage.exe")
  const command = `
$repoExe = [System.IO.Path]::GetFullPath(${quoteForPowerShell(exePath)})
Get-CimInstance Win32_Process -Filter "Name = 'openusage.exe'" |
  Where-Object { $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq $repoExe) } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
    Write-Output ("Stopped stale OpenUsage dev process PID " + $_.ProcessId)
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

  if (process.platform === "win32") {
    return {
      command: "npx",
      args: ["tauri", ...args],
      spawnOptions: {
        shell: true,
      },
    }
  }

  return { command: "npx", args: ["tauri", ...args] }
}

if (process.platform === "win32" && args[0] === "dev") {
  clearStaleWindowsDebugMetadata()
  stopStaleWindowsDevProcess()
}

const tauriCli = resolveTauriCli()
const child = spawn(tauriCli.command, tauriCli.args, {
  cwd: repoRoot,
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
