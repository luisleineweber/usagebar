import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ProviderDetailPage } from "@/pages/provider-detail"

describe("ProviderDetailPage", () => {
  it("shows not found when plugin missing", () => {
    render(<ProviderDetailPage plugin={null} displayMode="used" resetTimerDisplayMode="relative" />)
    expect(screen.getByText("Provider not found")).toBeInTheDocument()
  })

  it("renders ProviderCard with all scope when plugin present", () => {
    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        plugin={{
          meta: { id: "a", name: "Alpha", iconUrl: "", lines: [], primaryCandidates: [] },
          data: { providerId: "a", displayName: "Alpha", iconUrl: "", lines: [] },
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastSuccessAt: null,
        }}
      />
    )
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0)
  })

  it("renders quick links when provided by plugin meta", () => {
    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        plugin={{
          meta: {
            id: "a",
            name: "Alpha",
            iconUrl: "",
            lines: [],
            primaryCandidates: [],
            links: [{ label: "Status", url: "https://status.example.com" }],
          },
          data: null,
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastSuccessAt: null,
        }}
      />
    )
    expect(screen.getByRole("button", { name: /status/i })).toBeInTheDocument()
  })

  it("renders the manage-provider CTA instead of inline setup", () => {
    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        plugin={{
          meta: { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
          data: null,
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastSuccessAt: null,
        }}
        onOpenProviderSettings={vi.fn()}
      />
    )

    expect(screen.getByText("Provider settings")).toBeInTheDocument()
    expect(screen.queryByText("How to connect")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Manage provider" })).toBeInTheDocument()
  })

  it("opens the standalone settings window for the current provider", async () => {
    const onOpenProviderSettings = vi.fn()

    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        plugin={{
          meta: { id: "ollama", name: "Ollama", iconUrl: "", lines: [], primaryCandidates: [] },
          data: null,
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastSuccessAt: null,
        }}
        onOpenProviderSettings={onOpenProviderSettings}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Manage provider" }))
    expect(onOpenProviderSettings).toHaveBeenCalledWith("ollama")
  })
})
