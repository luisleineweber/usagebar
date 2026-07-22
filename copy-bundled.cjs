const { cpSync, existsSync, readFileSync, readdirSync, rmSync } = require("fs")
const { join } = require("path")

const root = __dirname
const exclude = new Set(["mock"])
const srcDir = join(root, "plugins")
const dstDir = join(root, "src-tauri", "resources", "bundled_plugins")

rmSync(dstDir, { recursive: true, force: true })

const plugins = readdirSync(srcDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !exclude.has(d.name))
  .map((d) => d.name)

for (const id of plugins) {
  const pluginDir = join(srcDir, id)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(pluginDir, "plugin.json"), "utf8"))
  } catch (error) {
    throw new Error(`Cannot read ${id}/plugin.json: ${error.message}`, { cause: error })
  }

  for (const field of ["entry", "icon"]) {
    const asset = manifest[field]
    if (typeof asset !== "string" || !asset.trim() || !existsSync(join(pluginDir, asset))) {
      throw new Error(`Plugin ${id} references missing ${field}: ${String(asset)}`)
    }
  }

  cpSync(pluginDir, join(dstDir, id), { recursive: true })
}

console.log(`Bundled ${plugins.length} plugins: ${plugins.join(", ")}`)
