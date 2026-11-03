import path from "node:path"
import { pathToFileURL } from "node:url"

const releaseDownloadBase = "https://github.com/luisleineweber/usagebar/releases/download"

export const STABLE_CHANNEL_TAG = "updater"
export const PRERELEASE_CHANNEL_TAG = "updater-prerelease"
export const PRERELEASE_CONFIG_PATH = "src-tauri/tauri.prerelease.conf.json"

export function channelEndpoint(channelTag) {
  return `${releaseDownloadBase}/${channelTag}/latest.json`
}

export function isPrereleaseTag(releaseTag) {
  return releaseTag.includes("-")
}

// Stable releases also feed the prerelease channel so prerelease builds can
// move to the final release. Prereleases never reach stable installs.
export function channelTagsForRelease(releaseTag) {
  return isPrereleaseTag(releaseTag)
    ? [PRERELEASE_CHANNEL_TAG]
    : [STABLE_CHANNEL_TAG, PRERELEASE_CHANNEL_TAG]
}

export function buildConfigArgsForRelease(releaseTag) {
  return isPrereleaseTag(releaseTag) ? ["--config", PRERELEASE_CONFIG_PATH] : []
}

function runCli([command, releaseTag]) {
  if (!releaseTag) {
    console.error("Usage: updater-channel.mjs <channels|build-args> <release-tag>")
    process.exit(1)
  }

  if (command === "channels") {
    console.log(channelTagsForRelease(releaseTag).join(" "))
  } else if (command === "build-args") {
    console.log(buildConfigArgsForRelease(releaseTag).join(" "))
  } else {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2))
}
