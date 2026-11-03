import type { ComponentProps } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ProviderSettingsDetail } from "@/components/settings/provider-settings-detail"
import type { PluginState } from "@/hooks/app/types"

vi.mock("@/lib/provider-accounts", () => ({
  listProviderAccountProfiles: vi.fn(async () => []),
  importCurrentProviderAccountProfile: vi.fn(),
  deleteProviderAccountProfile: vi.fn(),
}))
vi.mock("@/lib/codex-accounts", () => ({
  listCodexAccountProfiles: vi.fn(async () => []),
  importCurrentCodexAccountProfile: vi.fn(),
  deleteCodexAccountProfile: vi.fn(),
}))

const claude = { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] }
const codex = { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] }

function pluginState(patch: Partial<PluginState> = {}): PluginState {
  return {
    data: null,
    loading: false,
    error: null,
    lastManualRefreshAt: null,
    lastSuccessAt: null,
    ...patch,
  }
}

const rateLimited = pluginState({
  error: "Usage request failed (HTTP 429). Try again later.",
  errorCategory: "providerResponse",
  lastSettledError: "Usage request failed (HTTP 429). Try again later.",
  setupDetection: [{ id: "claude-oauth", state: "found" }],
})

const expired = pluginState({
  error: "Codex login expired.",
  errorCategory: "credentialExpired",
  lastSettledError: "Codex login expired.",
})

function renderDetail(props: Partial<ComponentProps<typeof ProviderSettingsDetail>>) {
  return render(
    <ProviderSettingsDetail plugin={claude} enabled onEnabledChange={vi.fn()} {...props} />
  )
}

function headingOrder(): string[] {
  return screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent ?? "")
}

describe("ProviderSettingsDetail sign-in views", () => {
  it("shows the manage view for a signed-in provider whose last check hit a rate limit", async () => {
    renderDetail({ state: rateLimited })

    expect(screen.getByRole("heading", { name: "Signed in" })).toBeInTheDocument()
    expect(screen.getByText("Signed in with Claude Code login.")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 429")
    // Sign-in guidance and credential entry stay out of the way.
    expect(screen.queryByText(/How to connect|Setup assistant/)).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Claude web Cookie header" })).toBeNull()
    expect(headingOrder().slice(0, 2)).toEqual(["Status", "Signed in"])
  })

  it("keeps the sign-in options available behind Change sign-in", async () => {
    renderDetail({ state: rateLimited })

    const toggle = screen.getByRole("button", { name: "Change sign-in" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("textbox", { name: "Claude web Cookie header" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "On this device" })).toBeInTheDocument()
  })

  it("puts signing in first when the last check rejected the credential", () => {
    renderDetail({ plugin: codex, state: expired })

    expect(headingOrder()[0]).toBe("Sign in")
    expect(screen.getByText(/The Codex sign-in no longer works\. Sign in again\./)).toBeVisible()
    expect(screen.queryByRole("heading", { name: "Signed in" })).not.toBeInTheDocument()
    expect(screen.queryByText("Codex Accounts")).not.toBeInTheDocument()
  })

  it("keeps the sign-in view while a retry after a rejected credential runs", () => {
    const { rerender } = renderDetail({ plugin: codex, state: expired })

    rerender(
      <ProviderSettingsDetail
        plugin={codex}
        enabled
        onEnabledChange={vi.fn()}
        state={{ ...expired, loading: true, error: null, errorCategory: null }}
      />
    )

    expect(headingOrder()[0]).toBe("Sign in")
  })

  it("does not offer the Codex dashboard cookie as a sign-in", () => {
    renderDetail({
      plugin: codex,
      state: expired,
      config: { secrets: { cookieHeader: { updatedAt: Date.now() } } },
    })

    // A stored optional-data cookie does not count as a sign-in.
    expect(headingOrder()[0]).toBe("Sign in")
    expect(screen.getByRole("heading", { name: "Optional data" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Dashboard Cookie header" })).toBeInTheDocument()
  })

  it("treats a stored sign-in credential as signed in", () => {
    renderDetail({ config: { secrets: { cookieHeader: { updatedAt: Date.now() } } } })

    expect(screen.getByRole("heading", { name: "Signed in" })).toBeInTheDocument()
  })
})
