import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HistoryPage } from "@/pages/history"

describe("HistoryPage", () => {
  it("shows the heading and an empty state when no provider has history entries", () => {
    render(
      <HistoryPage
        plugins={[
          {
            meta: { id: "a", name: "Alpha", iconUrl: "", lines: [] },
            data: { providerId: "a", displayName: "Alpha", iconUrl: "", lines: [] },
            loading: false,
            error: null,
            lastManualRefreshAt: null,
          },
        ]}
      />
    )

    expect(screen.getByRole("heading", { level: 2, name: "Usage History" })).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "No usage history yet" })).toBeInTheDocument()
  })
})
