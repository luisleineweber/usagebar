import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { UsageReport } from "@/components/usage-report"
import type { PluginOutput } from "@/lib/plugin-types"

const NOW_MS = Date.UTC(2026, 6, 10, 12)

function output(): PluginOutput {
  return {
    providerId: "openai-api",
    displayName: "OpenAI API",
    iconUrl: "openai.svg",
    lines: [],
    history: {
      version: 1,
      source: "openai-organization",
      timeZone: "UTC",
      entries: [
        {
          periodStart: "2026-07-09T00:00:00.000Z",
          periodEnd: "2026-07-10T00:00:00.000Z",
          model: "gpt-4.1",
          costUsd: 1,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          requests: 2,
        },
        {
          periodStart: "2026-07-10T00:00:00.000Z",
          periodEnd: "2026-07-11T00:00:00.000Z",
          model: "gpt-5",
          costUsd: 2.5,
          inputTokens: 300,
          outputTokens: 100,
          totalTokens: 400,
          requests: 4,
        },
      ],
    },
  }
}

describe("UsageReport", () => {
  it("explains when a provider has no activity history", () => {
    render(
      <UsageReport
        outputs={[{ providerId: "cursor", displayName: "Cursor", iconUrl: "cursor.svg", lines: [] }]}
      />
    )
    expect(screen.getByText(/does not expose local activity history yet/i)).toBeInTheDocument()
  })

  it("renders totals, source provenance, and an accessible trend", () => {
    render(<UsageReport outputs={[output()]} nowMs={NOW_MS} />)
    expect(screen.getAllByText(/3[,.]50/).length).toBeGreaterThan(0)
    expect(screen.getByText("550")).toBeInTheDocument()
    expect(screen.getByText(/Source: openai-organization/i)).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Cost trend/i })).toBeInTheDocument()
    expect(screen.getByText(/Top model:/i)).toHaveTextContent("gpt-5")
  })

  it("switches period and metric without hiding the underlying history", async () => {
    const user = userEvent.setup()
    render(<UsageReport outputs={[output()]} nowMs={NOW_MS} />)

    await user.click(screen.getByRole("button", { name: "Today" }))
    expect(screen.getAllByText(/2[,.]50/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole("button", { name: "Tokens" }))
    expect(screen.getByRole("img", { name: /Tokens trend/i })).toBeInTheDocument()
    expect(screen.getAllByText("400").length).toBeGreaterThan(0)
  })
})
