import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"

function normalizeForComparison(filePath) {
  return path.normalize(path.resolve(filePath)).toLowerCase()
}

export function findStaleDebugBuildMetadata(repoRoot) {
  const buildDir = path.join(repoRoot, "src-tauri", "target", "debug", "build")

  if (!existsSync(buildDir)) {
    return []
  }

  const normalizedBuildDir = normalizeForComparison(buildDir)
  const staleEntries = []

  for (const entry of readdirSync(buildDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const packageDir = path.join(buildDir, entry.name)
    const rootOutputPath = path.join(packageDir, "root-output")

    if (!existsSync(rootOutputPath)) {
      continue
    }

    const outputDir = readFileSync(rootOutputPath, "utf8").trim()

    if (!outputDir) {
      continue
    }

    const normalizedOutputDir = normalizeForComparison(outputDir)
    const expectedPrefix = `${normalizedBuildDir}${path.sep}`

    if (
      normalizedOutputDir !== normalizedBuildDir &&
      !normalizedOutputDir.startsWith(expectedPrefix)
    ) {
      staleEntries.push({ outputDir, packageDir, rootOutputPath })
    }
  }

  return staleEntries
}

export function cleanupStaleDebugBuildMetadata(repoRoot) {
  const staleEntries = findStaleDebugBuildMetadata(repoRoot)

  if (staleEntries.length === 0) {
    return { removed: false, staleEntries }
  }

  const debugDir = path.join(repoRoot, "src-tauri", "target", "debug")
  const buildDir = path.join(debugDir, "build")
  const fingerprintDir = path.join(debugDir, ".fingerprint")

  rmSync(buildDir, { recursive: true, force: true })
  rmSync(fingerprintDir, { recursive: true, force: true })

  return {
    removed: true,
    staleEntries,
    buildDir,
    fingerprintDir,
  }
}

export function getTauriChildEnv(args, baseEnv = process.env) {
  return {
    ...baseEnv,
    ...(args[0] === "dev" ? { USAGEBAR_TAURI_DEV: "1" } : {}),
  }
}
