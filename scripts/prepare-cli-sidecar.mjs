import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "..")
const tauriRoot = path.join(repoRoot, "src-tauri")
const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE || rustHostTriple()
const executableExtension = targetTriple.includes("windows") ? ".exe" : ""
const cargoArgs = ["build", "--manifest-path", path.join(tauriRoot, "Cargo.toml"), "--release", "--bin", "usagebar-cli"]

if (process.env.TAURI_ENV_TARGET_TRIPLE) {
  cargoArgs.push("--target", targetTriple)
}

const build = spawnSync("cargo", cargoArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    // This command creates the sidecar. Avoid validating externalBin until the real Tauri build.
    TAURI_CONFIG: JSON.stringify({ bundle: { externalBin: [] } }),
  },
})
if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status ?? 1)

const targetDirectory = process.env.TAURI_ENV_TARGET_TRIPLE
  ? path.join(tauriRoot, "target", targetTriple, "release")
  : path.join(tauriRoot, "target", "release")
const source = path.join(targetDirectory, `usagebar-cli${executableExtension}`)
const binariesDirectory = path.join(tauriRoot, "binaries")
const destination = path.join(
  binariesDirectory,
  `usagebar-cli-${targetTriple}${executableExtension}`
)

mkdirSync(binariesDirectory, { recursive: true })
copyFileSync(source, destination)
console.log(`Prepared CLI sidecar: ${path.relative(repoRoot, destination)}`)

function rustHostTriple() {
  const result = spawnSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" })
  if (result.error) throw result.error
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Could not determine the Rust host target triple")
  }
  return result.stdout.trim()
}
