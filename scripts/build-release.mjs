import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..")
const args = process.argv.slice(2)
const env = { ...process.env }
const envPath = path.join(repoRoot, ".env")
const bundleDir = path.join(repoRoot, "src-tauri", "target", "release", "bundle")
const windowsSignScript = path.join(repoRoot, "scripts", "sign-windows.ps1")

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
  console.log("No TAURI_SIGNING_PRIVATE_KEY found; building without Tauri updater signatures.")
}

function hasWindowsSigningMaterial() {
  return Boolean(
    env.WINDOWS_CERTIFICATE_THUMBPRINT ||
      env.WINDOWS_CERTIFICATE_BASE64 ||
      env.WINDOWS_CERTIFICATE
  )
}

function allowsUnsignedWindowsInstaller() {
  return env.USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER === "1" ||
    env.USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER?.toLowerCase() === "true"
}

function requestsWindowsInstaller() {
  const joinedArgs = resolvedArgs.join(" ")
  return (
    resolvedArgs.length === 0 ||
    joinedArgs.includes("nsis") ||
    joinedArgs.includes("msi") ||
    joinedArgs.includes("all")
  )
}

if (
  process.platform === "win32" &&
  requestsWindowsInstaller() &&
  !hasWindowsSigningMaterial() &&
  !allowsUnsignedWindowsInstaller()
) {
  console.error(
    "Refusing to build a Windows installer without Authenticode signing material; it would launch as Unknown publisher."
  )
  console.error(
    "Set WINDOWS_CERTIFICATE_BASE64 plus WINDOWS_CERTIFICATE_PASSWORD, WINDOWS_CERTIFICATE, or WINDOWS_CERTIFICATE_THUMBPRINT. For disposable local smoke builds only, set USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1."
  )
  process.exit(1)
}

rmSync(bundleDir, { recursive: true, force: true })

function collectWindowsInstallerArtifacts(artifactDirs) {
  const artifacts = []

  for (const dir of artifactDirs) {
    const dirName = path.basename(dir).toLowerCase()
    if (dirName !== "nsis" && dirName !== "msi") {
      continue
    }

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue
      }

      const extension = path.extname(entry.name).toLowerCase()
      if (extension === ".exe" || extension === ".msi") {
        artifacts.push(path.join(dir, entry.name))
      }
    }
  }

  return artifacts
}

function signWindowsInstallerArtifacts(artifactDirs) {
  if (process.platform !== "win32" || !hasWindowsSigningMaterial()) {
    return
  }

  const artifacts = collectWindowsInstallerArtifacts(artifactDirs)
  if (artifacts.length === 0) {
    return
  }

  console.log("")
  console.log("Signing Windows installer artifacts after build:")

  for (const artifact of artifacts) {
    const signer = spawnSync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      windowsSignScript,
      "-TargetPath",
      artifact,
    ], {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    })

    if (signer.error) {
      console.error("Failed to launch Windows installer signing:", signer.error)
      process.exit(1)
    }

    if (signer.signal) {
      process.kill(process.pid, signer.signal)
      return
    }

    if (signer.status !== 0) {
      process.exit(signer.status ?? 1)
    }
  }
}

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
    signWindowsInstallerArtifacts(artifactDirs)

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
