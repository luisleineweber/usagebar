import type { ComponentProps } from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProviderSettingsDetail } from "@/components/settings/provider-settings-detail"
import type { PluginState } from "@/hooks/app/types"
import type { PluginMeta } from "@/lib/plugin-types"

const listProfilesMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/provider-accounts", () => ({
  listProviderAccountProfiles: listProfilesMock,
  importCurrentProviderAccountProfile: vi.fn(),
  deleteProviderAccountProfile: vi.fn(),
}))
vi.mock("@/lib/codex-accounts", () => ({
  listCodexAccountProfiles: vi.fn(async () => []),
  importCurrentCodexAccountProfile: vi.fn(),
  deleteCodexAccountProfile: vi.fn(),
}))

function plugin(id: string, name: string, extra: Partial<PluginMeta> = {}) {
  return { id, name, iconUrl: `/${id}.svg`, lines: [], primaryCandidates: [], ...extra }
}

const output = (providerId: string) => ({
  providerId,
  displayName: providerId,
  iconUrl: `/${providerId}.svg`,
  lines: [],
})

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

function renderDetail(props: Partial<ComponentProps<typeof ProviderSettingsDetail>> = {}) {
  const onRetry = vi.fn()
  const onOpenInTray = vi.fn()
  render(
    <ProviderSettingsDetail
      plugin={plugin("openrouter", "OpenRouter", {
        supportState: "experimental",
        supportMessage: "Windows experimental. Use a stored OpenRouter management key.",
      })}
      enabled
      state={pluginState()}
      onEnabledChange={vi.fn()}
      onRetry={onRetry}
      onOpenInTray={onOpenInTray}
      {...props}
    />
  )
  return { onRetry, onOpenInTray }
}

function headerBadge(): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3 })
  const badge = heading.parentElement?.querySelector("[data-state]")
  if (!(badge instanceof HTMLElement)) throw new Error("Header state badge is missing")
  return badge
}

describe("ProviderSettingsDetail state vocabulary", () => {
  beforeEach(() => {
    listProfilesMock.mockReset()
    listProfilesMock.mockResolvedValue([])
  })

  it.each([
    ["Setup needed", true, pluginState()],
    ["Connected", true, pluginState({ data: output("openrouter"), lastSuccessAt: Date.now() })],
    ["Disabled", false, pluginState()],
  ])("shows %s once, in the header", (label, enabled, state) => {
    renderDetail({ enabled, state })

    expect(headerBadge()).toHaveTextContent(label)
    expect(screen.getAllByText(label)).toHaveLength(1)
    expect(screen.queryByText("Attention needed")).not.toBeInTheDocument()
    expect(screen.queryByText(/^(Setup|Ready|Not connected)$/)).not.toBeInTheDocument()
  })

  it("shows Error, not Connected, when a failed check keeps earlier data", () => {
    renderDetail({
      state: pluginState({
        data: output("openrouter"),
        error: "Management key was rejected.",
        lastSuccessAt: Date.now() - 60_000,
      }),
    })

    expect(headerBadge()).toHaveTextContent("Error")
    expect(screen.queryByText("Connected")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Management key was rejected.")
  })

  it("keeps Error, not Connected, while a retry after a failure runs", () => {
    renderDetail({
      state: pluginState({
        data: output("openrouter"),
        loading: true,
        error: null,
        lastSettledError: "Management key was rejected.",
        lastSuccessAt: Date.now() - 60_000,
      }),
    })

    expect(headerBadge()).toHaveTextContent("Error")
    expect(screen.queryByText("Connected")).not.toBeInTheDocument()
  })

  it("shows Setup needed, not Connected, while loading without a settled probe", () => {
    renderDetail({
      state: pluginState({ data: output("openrouter"), loading: true, error: null }),
    })

    expect(headerBadge()).toHaveTextContent("Setup needed")
    expect(screen.getAllByText("Setup needed")).toHaveLength(1)
    expect(screen.queryByText("Connected")).not.toBeInTheDocument()
  })

  it("shows Unsupported, not Disabled, for a provider that cannot run here", () => {
    renderDetail({
      enabled: true,
      plugin: plugin("antigravity", "Antigravity", {
        supportState: "comingSoonOnWindows",
        supportMessage: "Coming soon on Windows. Antigravity needs a macOS helper.",
      }),
    })

    expect(headerBadge()).toHaveTextContent("Unsupported")
    expect(screen.getAllByText("Unsupported")).toHaveLength(1)
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument()
    expect(screen.queryByText("This provider is turned off.")).not.toBeInTheDocument()
    expect(
      screen.getAllByText("Coming soon on Windows. Antigravity needs a macOS helper.").length
    ).toBeGreaterThan(0)
  })

  it("disables provider actions while the provider is turned off", async () => {
    const { onRetry, onOpenInTray } = renderDetail({ enabled: false })

    const check = screen.getByRole("button", { name: "Check again" })
    const openInTray = screen.getByRole("button", { name: "Open in tray" })
    expect(check).toBeDisabled()
    expect(openInTray).toBeDisabled()
    expect(screen.getByText("Enable this provider to check it.")).toBeInTheDocument()
    await userEvent.click(check)
    expect(onRetry).not.toHaveBeenCalled()
    expect(onOpenInTray).not.toHaveBeenCalled()
  })

  it("uses one name for the provider check action", async () => {
    const { onRetry } = renderDetail()

    await userEvent.click(screen.getByRole("button", { name: "Check again" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /ping now|^retry$|scan again/i })).toBeNull()
  })

  it("shows no empty secret state and no re-authentication without a stored credential", () => {
    renderDetail()

    expect(screen.queryByText("No secret stored")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Re-authenticate" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save secret" })).toBeInTheDocument()
  })

  it("does not repeat the experimental support message in the connect guidance", () => {
    renderDetail()

    expect(screen.getByText("Experimental")).toBeInTheDocument()
    expect(screen.queryByText(/Windows experimental\./)).not.toBeInTheDocument()
  })
})

describe("ProviderSettingsDetail copy and labels", () => {
  beforeEach(() => {
    listProfilesMock.mockReset()
    listProfilesMock.mockResolvedValue([])
  })

  it("shows no internal developer text for a connected Cursor provider", () => {
    renderDetail({
      plugin: plugin("cursor", "Cursor"),
      state: pluginState({ data: output("cursor"), lastSuccessAt: Date.now() }),
    })

    expect(screen.getByRole("heading", { name: "Signed in" })).toBeInTheDocument()
    expect(screen.queryByText(/deferred|persistence is modeled|Current plugin/i)).toBeNull()
  })

  it("names Claude controls by their visible labels", async () => {
    // Signed out, so the sign-in options are visible.
    renderDetail({ plugin: plugin("claude", "Claude") })

    const cookie = screen.getByRole("textbox", { name: "Claude web Cookie header" })
    expect(cookie).toHaveAccessibleDescription(/press F12, select Network/)
    expect(screen.getByRole("checkbox", { name: "Microsoft Edge import" })).toBeInTheDocument()
  })

  it("explains Import current login for Claude like for Codex", async () => {
    renderDetail({
      plugin: plugin("claude", "Claude"),
      state: pluginState({ data: output("claude"), lastSuccessAt: Date.now() }),
    })

    const accounts = (await screen.findByText("Claude Accounts")).parentElement as HTMLElement
    expect(
      within(accounts).getByText(
        "Import the current Claude Code login into an app-managed profile when you want UsageBar to stay pinned to one account."
      )
    ).toBeInTheDocument()
    expect(await screen.findByText(/UsageBar uses the detected local login/)).toBeInTheDocument()
  })
})
