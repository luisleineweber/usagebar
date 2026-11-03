import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  PRERELEASE_CHANNEL_TAG,
  PRERELEASE_CONFIG_PATH,
  STABLE_CHANNEL_TAG,
  buildConfigArgsForRelease,
  channelEndpoint,
  channelTagsForRelease,
} from "./updater-channel.mjs"

const repoRoot = path.resolve(import.meta.dirname, "..")

function readUpdaterEndpoints(relativePath) {
  const config = JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"))
  return config.plugins.updater.endpoints
}

test("stable releases feed both updater channels", () => {
  assert.deepEqual(channelTagsForRelease("v0.1.2"), [STABLE_CHANNEL_TAG, PRERELEASE_CHANNEL_TAG])
  assert.deepEqual(buildConfigArgsForRelease("v0.1.2"), [])
})

test("prereleases never reach the stable updater channel", () => {
  assert.deepEqual(channelTagsForRelease("v0.2.0-alpha.1"), [PRERELEASE_CHANNEL_TAG])
  assert.deepEqual(buildConfigArgsForRelease("v0.2.0-alpha.1"), ["--config", PRERELEASE_CONFIG_PATH])
})

test("stable and prerelease builds read their own channel", () => {
  assert.deepEqual(readUpdaterEndpoints("src-tauri/tauri.conf.json"), [
    channelEndpoint(STABLE_CHANNEL_TAG),
  ])
  assert.deepEqual(readUpdaterEndpoints(PRERELEASE_CONFIG_PATH), [
    channelEndpoint(PRERELEASE_CHANNEL_TAG),
  ])
})
