import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UsageReport } from "@/components/usage-report"
import type { PluginOutput } from "@/lib/plugin-types"

vi.mock("@/lib/report-pricing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/report-pricing")>()),
  loadModelPriceOverrides: async () => ({}),
}))

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
  it("hides the history section when no provider exposes activity history", () => {
    render(
      <UsageReport
        outputs={[
          { providerId: "cursor", displayName: "Cursor", iconUrl: "cursor.svg", lines: [] },
        ]}
      />
    )
    expect(screen.queryByRole("region", { name: "Usage history" })).not.toBeInTheDocument()
  })

  it("renders totals, source provenance, and an accessible trend", () => {
    render(<UsageReport outputs={[output()]} nowMs={NOW_MS} />)
    expect(screen.getAllByText(/3[,.]50/).length).toBeGreaterThan(0)
    expect(screen.getByText("550")).toBeInTheDocument()
    expect(screen.getByText(/Source: openai-organization/i)).toBeInTheDocument()
    expect(screen.getByRole("group", { name: /Cost trend/i })).toBeInTheDocument()
    expect(screen.getByText(/Top model:/i)).toHaveTextContent("gpt-5")
  })

  it("uses compact spacing without a border on a standalone history page", () => {
    render(<UsageReport outputs={[output()]} nowMs={NOW_MS} showSectionBorder={false} />)

    const region = screen.getByRole("region", { name: "Usage history" })
    expect(region).not.toHaveClass("border-t")
    expect(region).toHaveClass("pt-1")
  })

  it("uses a themed model popup instead of the native select menu", async () => {
    const user = userEvent.setup()
    render(<UsageReport outputs={[output()]} nowMs={NOW_MS} />)

    const trigger = screen.getByRole("combobox", { name: "Models" })
    expect(trigger.tagName).not.toBe("SELECT")

    trigger.focus()
    await user.keyboard("{Enter}")

    const listbox = screen.getByRole("listbox")
    const selectedOption = within(listbox).getByRole("option", { name: "gpt-4.1" })
    expect(selectedOption).toHaveClass("data-highlighted:bg-page-accent")
    expect(selectedOption).toHaveClass("data-selected:bg-page-accent/10")
    expect(selectedOption).toHaveClass("data-selected:font-medium")

    await user.click(within(listbox).getByRole("option", { name: "gpt-5" }))
    expect(trigger).toHaveTextContent("gpt-5")
  })

  it("reveals date, tokens, and cost when a chart point is hovered or focused", async () => {
    const user = userEvent.setup()
    render(<UsageReport outputs={[output()]} nowMs={NOW_MS} />)

    const point = screen.getByRole("button", {
      name: /2026-07-10: 400 tokens/,
    })
    expect(screen.queryByTestId("history-tooltip")).not.toBeInTheDocument()

    await user.hover(point)
    expect(screen.getByTestId("history-tooltip")).toHaveTextContent("10")
    expect(screen.getByTestId("history-tooltip")).toHaveTextContent("400 tokens")
    expect(screen.getByTestId("history-tooltip")).toHaveTextContent(/2[,.]50/)

    await user.unhover(point)
    expect(screen.queryByTestId("history-tooltip")).not.toBeInTheDocument()

    fireEvent.focus(point)
    expect(point).toHaveClass("is-active")
    expect(screen.getByTestId("history-tooltip")).toBeInTheDocument()
  })

  it("labels local calendar days instead of the preceding UTC date", () => {
    const data = output()
    data.history = {
      ...data.history!,
      timeZone: "Europe/Berlin",
      entries: [
        {
          periodStart: "2026-07-21T22:00:00.000Z",
          periodEnd: "2026-07-22T22:00:00.000Z",
          costUsd: 1,
          totalTokens: 100,
        },
        {
          periodStart: "2026-07-20T22:00:00.000Z",
          periodEnd: "2026-07-21T22:00:00.000Z",
          costUsd: 0.5,
          totalTokens: 50,
        },
      ],
    }

    render(<UsageReport outputs={[data]} nowMs={Date.UTC(2026, 6, 22, 12)} />)

    expect(screen.getByRole("button", { name: /2026-07-22: 100 tokens/ })).toBeInTheDocument()
  })

  it("uses multi-day periods and switches metric without hiding history", async () => {
    const user = userEvent.setup()
    render(<UsageReport outputs={[output()]} nowMs={NOW_MS} />)

    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Yesterday" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Tokens" }))
    expect(screen.getByRole("group", { name: /Tokens trend/i })).toHaveTextContent("400")
  })

  it("uses a daily activity summary instead of a single chart point", async () => {
    const user = userEvent.setup()
    const data = output()
    data.history!.entries = [data.history!.entries[1]]
    render(<UsageReport outputs={[data]} nowMs={NOW_MS} />)

    await user.click(screen.getByRole("button", { name: "7d" }))

    expect(screen.getByLabelText("Daily activity")).toHaveTextContent("Activity on 2026-07-10")
    expect(screen.queryByRole("group", { name: /Cost trend/i })).not.toBeInTheDocument()
  })

  it("shows a useful empty state and offers a longer period when the range has no activity", async () => {
    const user = userEvent.setup()
    const data = output()
    data.history!.entries = [
      {
        ...data.history!.entries[0],
        periodStart: "2026-06-15T00:00:00.000Z",
        periodEnd: "2026-06-16T00:00:00.000Z",
      },
      {
        ...data.history!.entries[1],
        periodStart: "2026-06-16T00:00:00.000Z",
        periodEnd: "2026-06-17T00:00:00.000Z",
      },
    ]

    render(<UsageReport outputs={[data]} nowMs={NOW_MS} />)

    await user.click(screen.getByRole("button", { name: "7d" }))

    expect(screen.getByRole("status", { name: "No activity in this period" })).toHaveTextContent(
      "No activity in this period"
    )
    await user.click(screen.getByRole("button", { name: "View 30 days" }))

    expect(
      screen.queryByRole("status", { name: "No activity in this period" })
    ).not.toBeInTheDocument()
  })

  it("does not label unavailable provider request counts as zero", () => {
    const data = output()
    data.history!.entries = data.history!.entries.map(
      ({
        costUsd: _costUsd,
        requests: _requests,
        inputTokens: _inputTokens,
        outputTokens: _outputTokens,
        totalTokens: _totalTokens,
        ...entry
      }) => entry
    )
    render(<UsageReport outputs={[data]} nowMs={NOW_MS} />)

    expect(screen.queryByRole("button", { name: "Requests" })).not.toBeInTheDocument()

    const costs = screen.getAllByText("Cost")
    const tokens = screen.getAllByText("Tokens")
    expect(costs[costs.length - 1].previousElementSibling).not.toHaveTextContent("0")
    expect(tokens[tokens.length - 1].previousElementSibling).not.toHaveTextContent("0")
    expect(screen.getByText("Requests").previousElementSibling).toHaveTextContent("—")
  })
})
