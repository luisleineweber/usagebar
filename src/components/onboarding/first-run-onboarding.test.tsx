import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FirstRunOnboarding } from "@/components/onboarding/first-run-onboarding"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"

function provider(
  id: string,
  state: Partial<SettingsPluginState["state"]> = {},
  enabled = ["codex", "claude", "cursor"].includes(id)
): SettingsPluginState {
  const names = new Map([
    ["codex", "Codex"],
    ["claude", "Claude"],
    ["cursor", "Cursor"],
    ["copilot", "GitHub Copilot"],
    ["ollama", "Ollama"],
  ])
  const meta = {
    id,
    name: names.get(id) ?? id,
    iconUrl: `/${id}.svg`,
    lines: [],
    primaryCandidates: [],
  }
  return {
    ...meta,
    enabled,
    hidden: false,
    supported: true,
    supportMessage: null,
    meta,
    state: {
      data: null,
      loading: false,
      error: null,
      lastManualRefreshAt: null,
      lastSuccessAt: null,
      ...state,
    },
  }
}

const providers = [provider("codex"), provider("claude"), provider("cursor")]

describe("FirstRunOnboarding", () => {
  it("preselects the recommended providers and starts their connection checks", async () => {
    const onConnect = vi.fn(async () => undefined)
    render(
      <FirstRunOnboarding
        providers={providers}
        onConnect={onConnect}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    expect(
      screen.getByRole("heading", { name: "What do you want to connect?" })
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Select Codex" })).toBeChecked()
      expect(screen.getByRole("checkbox", { name: "Select Claude" })).toBeChecked()
      expect(screen.getByRole("checkbox", { name: "Select Cursor" })).toBeChecked()
    })

    await userEvent.click(screen.getByRole("button", { name: "Check connections" }))

    expect(onConnect).toHaveBeenCalledWith(
      ["codex", "claude", "cursor"],
      ["codex", "claude", "cursor"]
    )
    expect(await screen.findAllByText("Not set up")).toHaveLength(3)
  })

  it("offers other supported providers without selecting them by default", async () => {
    render(
      <FirstRunOnboarding
        providers={[...providers, provider("copilot")]}
        onConnect={vi.fn(async () => undefined)}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    expect(await screen.findByRole("checkbox", { name: "Select GitHub Copilot" })).not.toBeChecked()
  })

  it("explains the Claude cookie fallback after a missing-credential failure", async () => {
    const onConnect = vi.fn(async () => undefined)
    const { rerender } = render(
      <FirstRunOnboarding
        providers={providers}
        onConnect={onConnect}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Select Claude" })).toBeChecked()
    )
    await userEvent.click(screen.getByRole("button", { name: "Check connections" }))

    rerender(
      <FirstRunOnboarding
        providers={[
          provider("codex"),
          provider("claude", {
            error: "Claude credentials not found",
            errorCategory: "credentialMissing",
          }),
          provider("cursor"),
        ]}
        onConnect={onConnect}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    expect(screen.getByText("Refresh failed")).toBeInTheDocument()
    expect(screen.getByText(/import the claude\.ai Cookie header from Edge/)).toBeInTheDocument()
  })

  it("shows the final success moment and opens UsageBar", async () => {
    const onFinish = vi.fn(async () => undefined)
    render(
      <FirstRunOnboarding
        providers={providers.map((item) =>
          provider(item.id, {
            data: {
              providerId: item.id,
              displayName: item.name,
              lines: [],
              iconUrl: item.iconUrl,
            },
          })
        )}
        onConnect={vi.fn(async () => undefined)}
        onRetry={vi.fn()}
        onFinish={onFinish}
      />
    )

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Select Codex" })).toBeChecked()
    )
    await userEvent.click(screen.getByRole("button", { name: "Check connections" }))
    expect(screen.queryByText(/Open a terminal/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Complete setup" }))

    expect(screen.getByRole("heading", { name: "UsageBar is ready" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Open UsageBar" }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it("keeps successful checks cached when the selection is reopened", async () => {
    const onConnect = vi.fn(async () => undefined)
    const { rerender } = render(
      <FirstRunOnboarding
        providers={providers}
        onConnect={onConnect}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: /Check connections/ }))
    rerender(
      <FirstRunOnboarding
        providers={providers.map((item) =>
          item.id === "codex"
            ? provider("codex", {
                data: {
                  providerId: "codex",
                  displayName: "Codex",
                  lines: [],
                  iconUrl: item.iconUrl,
                },
              })
            : item
        )}
        onConnect={onConnect}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Change selection" }))
    await userEvent.click(screen.getByRole("button", { name: /Check connections/ }))

    expect(onConnect).toHaveBeenNthCalledWith(
      2,
      ["codex", "claude", "cursor"],
      ["claude", "cursor"]
    )
  })

  it("removes a failed provider from the onboarding selection", async () => {
    const onConnect = vi.fn(async () => undefined)
    render(
      <FirstRunOnboarding
        providers={[
          provider("codex"),
          provider("claude", {
            error: "Claude credentials not found",
            errorCategory: "credentialMissing",
          }),
          provider("cursor"),
        ]}
        onConnect={onConnect}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: /Check connections/ }))
    await userEvent.click(screen.getByRole("button", { name: "Claude more actions" }))
    await userEvent.click(screen.getByRole("menuitem", { name: "Remove provider" }))

    expect(screen.queryByText("Claude credentials not found")).not.toBeInTheDocument()
    expect(onConnect).toHaveBeenLastCalledWith(["codex", "cursor"], [])
  })

  it("offers an inline cookie field with provider guidance after a cookie failure", async () => {
    const onSecretSave = vi.fn(async () => undefined)
    const onRetry = vi.fn()
    render(
      <FirstRunOnboarding
        providers={[
          provider(
            "ollama",
            {
              error: "Stored Ollama cookie header was not found",
              errorCategory: "credentialMissing",
            },
            true
          ),
        ]}
        onConnect={vi.fn(async () => undefined)}
        onRetry={onRetry}
        onSecretSave={onSecretSave}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: /Check connections/ }))

    expect(screen.getByText("Connect this provider")).toBeInTheDocument()
    expect(screen.getByText("Option 1: Sign in to Ollama (recommended)")).toBeInTheDocument()
    expect(screen.getByText("Option 2: Copy the Cookie header from a browser")).toBeInTheDocument()
    expect(screen.getByText(/ollama\.com\/settings/)).toBeInTheDocument()
    expect(screen.getByText(/ollama signin/)).toBeInTheDocument()

    await userEvent.type(
      screen.getByRole("textbox", { name: "Ollama Cookie header" }),
      "session=abc;"
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Save Cookie header and check again" })
    )

    expect(onSecretSave).toHaveBeenCalledWith("ollama", "cookieHeader", "session=abc;")
    expect(onRetry).toHaveBeenCalledWith("ollama")
  })

  it("does not show a cookie field for an API-key provider", async () => {
    render(
      <FirstRunOnboarding
        providers={[
          provider(
            "copilot",
            {
              error: "GitHub authentication required",
              errorCategory: "credentialMissing",
            },
            true
          ),
        ]}
        onConnect={vi.fn(async () => undefined)}
        onRetry={vi.fn()}
        onSecretSave={vi.fn(async () => undefined)}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: /Check connections/ }))

    expect(screen.queryByText("Connect this provider")).not.toBeInTheDocument()
  })

  it("shows a recoverable selection error", async () => {
    const onConnect = vi.fn(async () => {
      throw new Error("save failed")
    })
    render(
      <FirstRunOnboarding
        providers={providers}
        onConnect={onConnect}
        onRetry={vi.fn()}
        onFinish={vi.fn(async () => undefined)}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: /Check connections/ }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save the selection.")
  })

  it("shows a recoverable finish error", async () => {
    const onFinish = vi.fn(async () => {
      throw new Error("finish failed")
    })
    render(
      <FirstRunOnboarding
        providers={providers}
        onConnect={vi.fn(async () => undefined)}
        onRetry={vi.fn()}
        onFinish={onFinish}
      />
    )

    await userEvent.click(await screen.findByRole("button", { name: /Check connections/ }))
    await userEvent.click(screen.getByRole("button", { name: /Complete setup/ }))
    await userEvent.click(screen.getByRole("button", { name: /Open UsageBar/ }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save the setup.")
  })
})
