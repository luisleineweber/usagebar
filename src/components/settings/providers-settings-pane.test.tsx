import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProvidersSettingsPane } from "@/components/settings/providers-settings-pane"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import type { PluginOutput } from "@/lib/plugin-types"

const ABACUS_SETUP = "Windows experimental. Save an Abacus AI Cookie header before probing."

function output(id: string, name: string): PluginOutput {
  return { providerId: id, displayName: name, lines: [], iconUrl: "" }
}

function provider(
  id: string,
  name: string,
  overrides: Partial<SettingsPluginState> = {},
  state: Partial<SettingsPluginState["state"]> = {}
): SettingsPluginState {
  return {
    id,
    name,
    iconUrl: `/${id}.svg`,
    enabled: true,
    hidden: false,
    supported: true,
    supportState: "supported",
    supportMessage: null,
    meta: { id, name, iconUrl: `/${id}.svg`, lines: [], primaryCandidates: [] },
    state: {
      data: null,
      loading: false,
      error: null,
      lastManualRefreshAt: null,
      lastSuccessAt: null,
      ...state,
    },
    ...overrides,
  }
}

const providers = [
  provider("codex", "Codex", {}, { data: output("codex", "Codex"), lastSuccessAt: 1 }),
  provider("claude", "Claude", {}, { error: "Not signed in" }),
  provider("cursor", "Cursor", { enabled: false }),
  provider("abacus", "Abacus AI", { supportState: "experimental", supportMessage: ABACUS_SETUP }),
  provider("zed", "Zed", { supported: false, supportState: "comingSoonOnWindows", enabled: false }),
  provider("amp", "Amp", { hidden: true }),
]

function renderPane(overrides: Partial<Parameters<typeof ProvidersSettingsPane>[0]> = {}) {
  const props = {
    providers,
    selectedProviderId: null,
    onSelectedProviderChange: vi.fn(),
    onToggle: vi.fn(),
    onShow: vi.fn(),
    onProviderConfigChange: vi.fn(async () => undefined),
    onProviderSecretSave: vi.fn(async () => undefined),
    onProviderSecretDelete: vi.fn(async () => undefined),
    onRetryProvider: vi.fn(),
    ...overrides,
  }
  render(<ProvidersSettingsPane {...props} />)
  return props
}

afterEach(() => {
  cleanup()
})

describe("ProvidersSettingsPane list", () => {
  it("shows one shared state label per row from authoritative state", () => {
    renderPane()
    const list = screen.getByRole("list", { name: "Providers" })
    const labels = within(list)
      .getAllByTestId("provider-list-state")
      .map((node) => node.textContent)

    // Order: priority providers first, then alphabetical.
    expect(labels).toEqual([
      "Connected",
      "Error",
      "Disabled",
      "Setup needed",
      "Setup needed",
      "Disabled",
    ])
  })

  it("keeps setup guidance and error text out of the row and its accessible name", () => {
    renderPane()
    const abacusRow = screen.getByRole("button", { name: "Abacus AI, Setup needed" })
    expect(abacusRow).not.toHaveTextContent(ABACUS_SETUP)
    expect(screen.queryByText(ABACUS_SETUP)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Claude, Error" })).not.toHaveTextContent(
      "Not signed in"
    )
  })

  it("opens the detail from the row and toggles from the labelled enable control", async () => {
    const props = renderPane()
    await userEvent.click(screen.getByRole("button", { name: "Cursor, Disabled" }))
    expect(props.onSelectedProviderChange).toHaveBeenCalledWith("cursor")

    const cursorRow = screen.getByRole("button", { name: "Cursor, Disabled" }).closest("li")!
    await userEvent.click(within(cursorRow).getByText("Enable"))
    expect(props.onToggle).toHaveBeenCalledWith("cursor")
    expect(props.onSelectedProviderChange).toHaveBeenCalledTimes(1)
  })

  it("moves focus within a column with arrow keys, Home, and End", async () => {
    renderPane()
    const codexRow = screen.getByRole("button", { name: "Codex, Connected" })
    codexRow.focus()

    await userEvent.keyboard("{ArrowDown}")
    expect(screen.getByRole("button", { name: "Claude, Error" })).toHaveFocus()
    await userEvent.keyboard("{End}")
    expect(screen.getByRole("button", { name: "Zed, Disabled" })).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(screen.getByRole("button", { name: "Zed, Disabled" })).toHaveFocus()
    await userEvent.keyboard("{Home}{ArrowUp}")
    expect(codexRow).toHaveFocus()

    screen.getByRole("checkbox", { name: "Enable Abacus AI" }).focus()
    await userEvent.keyboard("{ArrowDown}")
    expect(screen.getByRole("checkbox", { name: "Enable Amp" })).toHaveFocus()
    // Zed cannot be enabled on Windows, so End skips its disabled checkbox.
    await userEvent.keyboard("{End}")
    expect(screen.getByRole("checkbox", { name: "Enable Amp" })).toHaveFocus()
  })
})
