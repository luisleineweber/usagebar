import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

type ManifestLine = { type: string; label: string }
type Manifest = { id: string; defaultPlan?: string; lines: ManifestLine[] }

const pluginsDir = join(process.cwd(), "plugins")
const manifests: Manifest[] = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => JSON.parse(readFileSync(join(pluginsDir, entry.name, "plugin.json"), "utf8")))

describe("plugin manifests", () => {
  it("loads every plugin manifest", () => {
    expect(manifests.length).toBeGreaterThan(30)
  })

  it("do not declare a default plan, because a plan badge needs provider provenance", () => {
    const withDefaultPlan = manifests.filter((manifest) => "defaultPlan" in manifest)
    expect(withDefaultPlan.map((manifest) => manifest.id)).toEqual([])
  })

  it("use direction-neutral progress labels, because the display mode sets used or left", () => {
    const directional = manifests.flatMap((manifest) =>
      manifest.lines
        .filter((line) => line.type === "progress")
        .filter((line) => /\b(used|spent|left|remaining)$/i.test(line.label))
        .map((line) => `${manifest.id}: ${line.label}`)
    )
    expect(directional).toEqual([])
  })
})
