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
  const names: Record<string, string> = {
    codex: "Codex",
    claude: "Claude",
    cursor: "Cursor",
    copilot: "GitHub Copilot",
    ollama: "Ollama",
  }
  const meta = {
    id,
    name: names[id] ?? id,
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

    expect(screen.getByRole("heading", { name: "Was möchtest du verbinden?" })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Codex auswählen" })).toBeChecked()
      expect(screen.getByRole("checkbox", { name: "Claude auswählen" })).toBeChecked()
      expect(screen.getByRole("checkbox", { name: "Cursor auswählen" })).toBeChecked()
    })

    await userEvent.click(screen.getByRole("button", { name: "Verbindungen prüfen" }))

    expect(onConnect).toHaveBeenCalledWith(
      ["codex", "claude", "cursor"],
      ["codex", "claude", "cursor"]
    )
    expect(await screen.findAllByText("Noch nicht eingerichtet")).toHaveLength(3)
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

    expect(
      await screen.findByRole("checkbox", { name: "GitHub Copilot auswählen" })
    ).not.toBeChecked()
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
      expect(screen.getByRole("checkbox", { name: "Claude auswählen" })).toBeChecked()
    )
    await userEvent.click(screen.getByRole("button", { name: "Verbindungen prüfen" }))

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

    expect(screen.getByText("Aktualisierung fehlgeschlagen")).toBeInTheDocument()
    expect(screen.getByText(/importiere den claude\.ai-Cookie aus Edge/)).toBeInTheDocument()
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
      expect(screen.getByRole("checkbox", { name: "Codex auswählen" })).toBeChecked()
    )
    await userEvent.click(screen.getByRole("button", { name: "Verbindungen prüfen" }))
    expect(screen.queryByText(/Öffne ein Terminal/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }))

    expect(screen.getByRole("heading", { name: "UsageBar ist bereit" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "UsageBar öffnen" }))
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

    await userEvent.click(await screen.findByRole("button", { name: /Verbindungen pr.fen/ }))
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

    await userEvent.click(screen.getByRole("button", { name: "Auswahl ändern" }))
    await userEvent.click(screen.getByRole("button", { name: /Verbindungen pr.fen/ }))

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

    await userEvent.click(await screen.findByRole("button", { name: /Verbindungen pr.fen/ }))
    await userEvent.click(screen.getByRole("button", { name: "Claude weitere Aktionen" }))
    await userEvent.click(screen.getByRole("menuitem", { name: "Provider entfernen" }))

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

    await userEvent.click(await screen.findByRole("button", { name: /Verbindungen pr.fen/ }))

    expect(screen.getByText("So stellst du die Verbindung her")).toBeInTheDocument()
    expect(screen.getByText("Variante 1: Mit Ollama anmelden (empfohlen)")).toBeInTheDocument()
    expect(screen.getByText("Variante 2: Cookie aus dem Browser")).toBeInTheDocument()
    expect(screen.getByText(/ollama\.com\/settings/)).toBeInTheDocument()
    expect(screen.getByText(/ollama signin/)).toBeInTheDocument()

    await userEvent.type(
      screen.getByRole("textbox", { name: "Ollama Cookie header" }),
      "session=abc;"
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Cookie speichern und erneut prüfen" })
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

    await userEvent.click(await screen.findByRole("button", { name: /Verbindungen pr.fen/ }))

    expect(screen.queryByText("Cookie als Fallback speichern")).not.toBeInTheDocument()
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

    await userEvent.click(await screen.findByRole("button", { name: /Verbindungen pr.fen/ }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Auswahl konnte nicht gespeichert werden."
    )
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

    await userEvent.click(await screen.findByRole("button", { name: /Verbindungen pr.fen/ }))
    await userEvent.click(screen.getByRole("button", { name: /Einrichtung abschlie.en/ }))
    await userEvent.click(screen.getByRole("button", { name: /UsageBar .ffnen/ }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Der Abschluss konnte nicht gespeichert werden."
    )
  })
})
