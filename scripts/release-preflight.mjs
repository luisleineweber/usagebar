import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import {
  PRERELEASE_CHANNEL_TAG,
  PRERELEASE_CONFIG_PATH,
  STABLE_CHANNEL_TAG,
  channelEndpoint,
} from "./updater-channel.mjs"

const repoRoot = path.resolve(import.meta.dirname, "..")
const args = process.argv.slice(2)

function fail(message) {
  console.error(`Release preflight failed: ${message}`)
  process.exit(1)
}

function readArgValue(flag) {
  const index = args.indexOf(flag)
  if (index === -1) {
    return null
  }

  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${flag}`)
  }

  return value
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"))
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function parseCargoVersion() {
  const cargoToml = readText("src-tauri/Cargo.toml")
  const match = cargoToml.match(/^version = "([^"]+)"$/m)
  if (!match) {
    fail("Could not read version from src-tauri/Cargo.toml")
  }
  return match[1]
}

function countPluginManifests(directory) {
  if (!existsSync(directory)) {
    return 0
  }

  let count = 0

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      count += countPluginManifests(fullPath)
      continue
    }

    if (entry.isFile() && entry.name === "plugin.json") {
      count += 1
    }
  }

  return count
}

const releaseTag = readArgValue("--release-tag") ?? process.env.RELEASE_TAG ?? null
const requireClean = args.includes("--require-clean")

const packageJson = readJson("package.json")
const tauriConf = readJson("src-tauri/tauri.conf.json")
const changelog = readText("CHANGELOG.md")
const cargoVersion = parseCargoVersion()

const version = packageJson.version
const semverPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u
const tagPattern = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u

if (!semverPattern.test(version)) {
  fail(`package.json version is not a release version: ${version}`)
}

if (tauriConf.version !== version) {
  fail(
    `src-tauri/tauri.conf.json version (${tauriConf.version}) does not match package.json (${version})`
  )
}

if (cargoVersion !== version) {
  fail(`src-tauri/Cargo.toml version (${cargoVersion}) does not match package.json (${version})`)
}

if (releaseTag) {
  if (!tagPattern.test(releaseTag)) {
    fail(`Release tag is invalid: ${releaseTag}`)
  }

  if (releaseTag !== `v${version}`) {
    fail(`Release tag (${releaseTag}) does not match version (${version})`)
  }
}

if (tauriConf.productName !== "UsageBar") {
  fail(`Tauri productName drifted from UsageBar: ${tauriConf.productName}`)
}

function requireSingleEndpoint(config, configPath, channelTag) {
  const endpoints = config.plugins?.updater?.endpoints ?? []
  const expected = channelEndpoint(channelTag)
  if (endpoints.length !== 1 || endpoints[0] !== expected) {
    fail(`${configPath} updater endpoint must be ${expected}`)
  }
}

requireSingleEndpoint(tauriConf, "src-tauri/tauri.conf.json", STABLE_CHANNEL_TAG)
requireSingleEndpoint(readJson(PRERELEASE_CONFIG_PATH), PRERELEASE_CONFIG_PATH, PRERELEASE_CHANNEL_TAG)

if (tauriConf.bundle?.createUpdaterArtifacts !== true) {
  fail("Tauri updater artifacts must be enabled")
}

// Installed builds trust only this key. Rotating it strands every installed
// release, so a rotation needs an explicit migration plan first.
const expectedUpdaterKeyId = "1172A2A8FDB20C1F"
const updaterPubkey = tauriConf.plugins?.updater?.pubkey
if (!updaterPubkey) {
  fail("Tauri updater public key is missing")
}
const updaterKeyComment = Buffer.from(updaterPubkey, "base64").toString("utf8").split("\n")[0]
if (!updaterKeyComment.endsWith(expectedUpdaterKeyId)) {
  fail(`Tauri updater public key must keep key ID ${expectedUpdaterKeyId}`)
}

if (!changelog.includes(`## ${version}`)) {
  fail(`CHANGELOG.md is missing a section for ${version}`)
}

const bundledPluginCount = countPluginManifests(
  path.join(repoRoot, "src-tauri", "resources", "bundled_plugins")
)
if (bundledPluginCount < 1) {
  fail("No bundled plugin manifests found under src-tauri/resources/bundled_plugins")
}

if (!existsSync(path.join(repoRoot, "scripts", "build-release.mjs"))) {
  fail("scripts/build-release.mjs is missing")
}

if (requireClean) {
  const gitStatus = spawnSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8",
  })

  if (gitStatus.status !== 0) {
    fail("git status --short failed")
  }

  if (gitStatus.stdout.trim()) {
    fail("Working tree is not clean")
  }
}

console.log(`Release version: ${version}`)
if (releaseTag) {
  console.log(`Release tag: ${releaseTag}`)
}
console.log(`Bundled plugins detected: ${bundledPluginCount}`)
console.log(`Updater key ID: ${expectedUpdaterKeyId}`)
if (requireClean) {
  console.log("Working tree: clean")
}
console.log("Release preflight passed.")
