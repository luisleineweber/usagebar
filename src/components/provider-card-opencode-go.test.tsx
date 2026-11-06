import { readFileSync } from "node:fs"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProviderCard } from "@/components/provider-card"
import type { ManifestLine, MetricLine } from "@/lib/plugin-types"

const manifest = JSON.parse(readFileSync("plugins/opencode-go/plugin.json", "utf8")) as {
  lines: ManifestLine[]
}

describe("ProviderCard with the OpenCode Go manifest", () => {
  it("shows the expired Go key badge in the overview", () => {
    const lines: MetricLine[] = [
      {
        type: "badge",
        label: "Go key",
        text: "Expired",
        color: "#f59e0b",
        subtitle: "Create a new API key in OpenCode Console to show Go usage.",
      },
    ]

    render(
      <ProviderCard
        name="OpenCode"
        displayMode="used"
        scopeFilter="overview"
        skeletonLines={manifest.lines}
        lines={lines}
      />
    )

    expect(screen.getByText("Go key")).toBeInTheDocument()
    expect(screen.getByText("Expired")).toBeInTheDocument()
  })
})
