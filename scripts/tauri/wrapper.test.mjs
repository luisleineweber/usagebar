import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  cleanupStaleDebugBuildMetadata,
  findStaleDebugBuildMetadata,
  getDevConfigArgs,
  getTauriChildEnv,
  getWindowsDevExeNames,
} from "./wrapper-lib.mjs"

function createRepoFixture() {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "usagebar-tauri-wrapper-"))
  const buildDir = path.join(repoRoot, "src-tauri", "target", "debug", "build")
  const fingerprintDir = path.join(repoRoot, "src-tauri", "target", "debug", ".fingerprint")

  mkdirSync(buildDir, { recursive: true })
  mkdirSync(fingerprintDir, { recursive: true })

  return { repoRoot, buildDir, fingerprintDir }
}

test("findStaleDebugBuildMetadata ignores current-repo root-output paths", () => {
  const { repoRoot, buildDir } = createRepoFixture()
  const packageDir = path.join(buildDir, "tauri-current")
  const currentOutputDir = path.join(packageDir, "out")

  mkdirSync(packageDir, { recursive: true })
  writeFileSync(path.join(packageDir, "root-output"), currentOutputDir)

  assert.deepEqual(findStaleDebugBuildMetadata(repoRoot), [])
})

test("cleanupStaleDebugBuildMetadata removes copied debug metadata from another repo path", () => {
  const { repoRoot, buildDir, fingerprintDir } = createRepoFixture()
  const packageDir = path.join(buildDir, "tauri-stale")

  mkdirSync(packageDir, { recursive: true })
  writeFileSync(
    path.join(packageDir, "root-output"),
    "D:\\PreviousCheckout\\usagebar\\src-tauri\\target\\debug\\build\\tauri-stale\\out"
  )

  const result = cleanupStaleDebugBuildMetadata(repoRoot)

  assert.equal(result.removed, true)
  assert.equal(result.staleEntries.length, 1)
  assert.equal(existsSync(buildDir), false)
  assert.equal(existsSync(fingerprintDir), false)
})

test("getTauriChildEnv marks only local dev launches", () => {
  assert.equal(getTauriChildEnv(["dev"], {}).USAGEBAR_TAURI_DEV, "1")
  assert.equal(getTauriChildEnv(["build"], {}).USAGEBAR_TAURI_DEV, undefined)
})

test("Windows dev cleanup uses only the configured UsageBar executable", () => {
  const { repoRoot } = createRepoFixture()
  const actualRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

  assert.deepEqual(getWindowsDevExeNames(repoRoot), [])
  assert.deepEqual(getWindowsDevExeNames(actualRepoRoot), ["usagebar.exe"])
  assert.deepEqual(
    getWindowsDevExeNames(repoRoot, () => '{"productName":"UsageBar"}'),
    ["usagebar.exe"]
  )
  assert.deepEqual(
    getWindowsDevExeNames(repoRoot, () => {
      throw new Error("missing config")
    }),
    []
  )
})

test("getDevConfigArgs applies the isolated dev config last", () => {
  const { repoRoot } = createRepoFixture()
  const localConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.local.json")
  const devConfigPath = path.join(repoRoot, "src-tauri", "tauri.dev.conf.json")

  writeFileSync(localConfigPath, "{}")

  assert.deepEqual(getDevConfigArgs(["dev"], repoRoot), [
    "--config",
    localConfigPath,
    "--config",
    devConfigPath,
  ])
  assert.deepEqual(getDevConfigArgs(["dev", "--config", "custom.json"], repoRoot), [
    "--config",
    devConfigPath,
  ])
  assert.deepEqual(getDevConfigArgs(["build"], repoRoot), [])
})

test("the dev wrapper has its plugin bundler entrypoint", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

  assert.equal(existsSync(path.join(repoRoot, "copy-bundled.cjs")), true)
})

test("the Vite root mounts the frontend entrypoint", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const indexPath = path.join(repoRoot, "index.html")

  assert.equal(existsSync(indexPath), true)
  assert.match(readFileSync(indexPath, "utf8"), /src\/main\.tsx/)
})

test("local dev uses an isolated Tauri identifier", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const releaseConfig = JSON.parse(
    readFileSync(path.join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8")
  )
  const devConfig = JSON.parse(
    readFileSync(path.join(repoRoot, "src-tauri", "tauri.dev.conf.json"), "utf8")
  )

  assert.equal(typeof devConfig.identifier, "string")
  assert.notEqual(devConfig.identifier, releaseConfig.identifier)
})

test("every provider manifest resolves to a real provider icon", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  const pluginsDir = path.join(repoRoot, "plugins")

  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "mock") continue
    const manifest = JSON.parse(
      readFileSync(path.join(pluginsDir, entry.name, "plugin.json"), "utf8")
    )
    const icon = readFileSync(path.join(pluginsDir, entry.name, manifest.icon), "utf8")

    assert.doesNotMatch(icon, /<text\b/, `${entry.name} icon must not be a text fallback`)
  }
})
