import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  cleanupStaleDebugBuildMetadata,
  findStaleDebugBuildMetadata,
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
    "D:\\UsageBar\\openusage\\src-tauri\\target\\debug\\build\\tauri-stale\\out"
  )

  const result = cleanupStaleDebugBuildMetadata(repoRoot)

  assert.equal(result.removed, true)
  assert.equal(result.staleEntries.length, 1)
  assert.equal(existsSync(buildDir), false)
  assert.equal(existsSync(fingerprintDir), false)
})
