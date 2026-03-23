import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ProviderSettingsDetail } from "@/components/settings/provider-settings-detail"

const codexPlugin = {
  id: "codex",
  name: "Codex",
  iconUrl: "/codex.svg",
  lines: [],
  primaryCandidates: [],
}

const ollamaPlugin = {
  id: "ollama",
  name: "Ollama",
  iconUrl: "/ollama.svg",
  lines: [],
  primaryCandidates: [],
}

const opencodePlugin = {
  id: "opencode",
  name: "OpenCode",
  iconUrl: "/opencode.svg",
  lines: [],
  primaryCandidates: [],
}

const opencodeGoPlugin = {
  id: "opencode-go",
  name: "OpenCode Go",
  iconUrl: "/opencode-go.svg",
  lines: [],
  primaryCandidates: [],
}

const openrouterPlaceholderPlugin = {
  id: "openrouter",
  name: "OpenRouter",
  iconUrl: "/openrouter.svg",
  supportState: "comingSoonOnWindows" as const,
  supportMessage: "Windows placeholder. Planned path: stored API key plus direct OpenRouter credits and key-info endpoints.",
  lines: [],
  primaryCandidates: [],
}

describe("ProviderSettingsDetail", () => {
  it("shows connection guidance for a disconnected provider", () => {
    render(
      <ProviderSettingsDetail
        plugin={codexPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText("How to connect")).toBeInTheDocument()
    expect(screen.getByText("Install Codex CLI, sign in on this machine, then retry the provider check.")).toBeInTheDocument()
  })

  it("shows loading state while refreshing", () => {
    render(
      <ProviderSettingsDetail
        plugin={codexPlugin}
        enabled
        state={{ data: null, loading: true, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText("Refreshing provider status...")).toBeInTheDocument()
  })

  it("shows connection details after a successful probe", () => {
    render(
      <ProviderSettingsDetail
        plugin={codexPlugin}
        enabled
        state={{
          data: { providerId: "codex", displayName: "Codex", iconUrl: "/codex.svg", lines: [] },
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastSuccessAt: Date.now(),
        }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText("Connection details")).toBeInTheDocument()
    expect(screen.getByText("Provider responded successfully.")).toBeInTheDocument()
  })

  it("saves an Ollama secret", async () => {
    const onSecretSave = vi.fn(async () => undefined)

    render(
      <ProviderSettingsDetail
        plugin={ollamaPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
        onSecretSave={onSecretSave}
      />
    )

    await userEvent.type(screen.getByLabelText("Ollama Cookie header"), "session=abc123")
    await userEvent.click(screen.getByRole("button", { name: "Save secret" }))

    await waitFor(() => {
      expect(onSecretSave).toHaveBeenCalledWith("ollama", "cookieHeader", "session=abc123")
    })
    expect(screen.getByText("Secret stored securely for this app.")).toBeInTheDocument()
  })

  it("shows precise string-shaped secret save errors", async () => {
    const onSecretSave = vi.fn(async () => {
      throw "Saved Ollama cookie header, but could not read it back from a fresh system credential vault lookup: Element not found"
    })

    render(
      <ProviderSettingsDetail
        plugin={ollamaPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
        onSecretSave={onSecretSave}
      />
    )

    await userEvent.type(screen.getByLabelText("Ollama Cookie header"), "session=abc123")
    await userEvent.click(screen.getByRole("button", { name: "Save secret" }))

    await waitFor(() => {
      expect(screen.getByText("Saved Ollama cookie header, but could not read it back from a fresh system credential vault lookup: Element not found")).toBeInTheDocument()
    })
  })

  it("clears an existing Ollama secret", async () => {
    const onSecretDelete = vi.fn(async () => undefined)

    render(
      <ProviderSettingsDetail
        plugin={ollamaPlugin}
        enabled
        config={{ secrets: { cookieHeader: { updatedAt: Date.now() } } }}
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
        onSecretDelete={onSecretDelete}
      />
    )

    await userEvent.click(screen.getByRole("button", { name: "Clear secret" }))

    await waitFor(() => {
      expect(onSecretDelete).toHaveBeenCalledWith("ollama", "cookieHeader")
    })
    expect(screen.getByText("Stored secret removed.")).toBeInTheDocument()
  })

  it("saves the OpenCode workspace override", async () => {
    const onConfigChange = vi.fn(async () => undefined)

    render(
      <ProviderSettingsDetail
        plugin={opencodePlugin}
        enabled
        config={{ source: "manual", workspaceId: "wrk_old" }}
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
        onConfigChange={onConfigChange}
      />
    )

    const input = screen.getByLabelText("OpenCode Workspace ID")
    await userEvent.clear(input)
    await userEvent.type(input, "wrk_new")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith("opencode", { workspaceId: "wrk_new" })
    })
  })

  it("updates the provider source", async () => {
    const onConfigChange = vi.fn(async () => undefined)

    render(
      <ProviderSettingsDetail
        plugin={opencodePlugin}
        enabled
        config={{ source: "manual" }}
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
        onConfigChange={onConfigChange}
      />
    )

    await userEvent.selectOptions(screen.getByLabelText("OpenCode source"), "auto")

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith("opencode", { source: "auto" })
    })
  })

  it("shows explicit OpenCode website and cookie capture guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={opencodePlugin}
        enabled
        config={{ source: "manual" }}
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/sign in at https:\/\/opencode.ai/i)).toBeInTheDocument()
    expect(screen.getByText(/copy the full Cookie request header/i)).toBeInTheDocument()
    expect(screen.getByText(/This is separate from OpenCode Go local CLI spend\./)).toBeInTheDocument()
    expect(screen.getByText(/Do not paste Set-Cookie\./)).toBeInTheDocument()
  })

  it("shows explicit OpenCode Go local-history guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={opencodeGoPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText("OpenCode Go")).toBeInTheDocument()
    expect(screen.getByText(/Detected from the local OpenCode auth file and SQLite history on this machine\./)).toBeInTheDocument()
    expect(screen.getByText(/Use OpenCode Go on this machine so ~\/\.local\/share\/opencode\/auth\.json or ~\/\.local\/share\/opencode\/opencode\.db exists, then retry\./)).toBeInTheDocument()
  })

  it("shows no editable inputs for auto-detected providers", () => {
    render(
      <ProviderSettingsDetail
        plugin={codexPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText("This provider currently relies on local auto-detection and does not expose editable settings yet.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Codex source")).not.toBeInTheDocument()
  })

  it("shows blocked placeholder guidance for planned Windows providers", () => {
    render(
      <ProviderSettingsDetail
        plugin={openrouterPlaceholderPlugin}
        enabled={false}
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText("Planned Windows implementation: use a stored API key against OpenRouter credits and key-info endpoints.")).toBeInTheDocument()
    expect(screen.getAllByText("Windows placeholder. Planned path: stored API key plus direct OpenRouter credits and key-info endpoints.").length).toBeGreaterThan(0)
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true")
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument()
  })
})
