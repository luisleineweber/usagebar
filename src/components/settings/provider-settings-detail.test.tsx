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

const cursorPlugin = {
  id: "cursor",
  name: "Cursor",
  iconUrl: "/cursor.svg",
  lines: [],
  primaryCandidates: [],
}

const copilotPlugin = {
  id: "copilot",
  name: "Copilot",
  iconUrl: "/copilot.svg",
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
  name: "OpenCode Zen",
  iconUrl: "/opencode.svg",
  lines: [],
  primaryCandidates: [],
}

const opencodeGoPlugin = {
  id: "opencode-go",
  name: "OpenCode",
  iconUrl: "/opencode-go.svg",
  lines: [],
  primaryCandidates: [],
}

const openrouterPlugin = {
  id: "openrouter",
  name: "OpenRouter",
  iconUrl: "/openrouter.svg",
  lines: [],
  primaryCandidates: [],
}

const kimiK2Plugin = {
  id: "kimi-k2",
  name: "Kimi K2",
  iconUrl: "/kimi-k2.svg",
  lines: [],
  primaryCandidates: [],
}

const kiloPlugin = {
  id: "kilo",
  name: "Kilo",
  iconUrl: "/kilo.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Use a stored Kilo API key or KILO_API_KEY to fetch usage. CLI fallback is not wired yet.",
  lines: [],
  primaryCandidates: [],
}

const warpPlugin = {
  id: "warp",
  name: "Warp",
  iconUrl: "/warp.svg",
  lines: [],
  primaryCandidates: [],
}

const zedPlugin = {
  id: "zed",
  name: "Zed",
  iconUrl: "/zed.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Zed billing spend uses a live browser-backed dashboard request; local telemetry remains the fallback.",
  lines: [],
  primaryCandidates: [],
}

const syntheticPlugin = {
  id: "synthetic",
  name: "Synthetic",
  iconUrl: "/synthetic.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Use a stored Synthetic API key or SYNTHETIC_API_KEY to fetch quota data.",
  lines: [],
  primaryCandidates: [],
}

const augmentPlugin = {
  id: "augment",
  name: "Augment",
  iconUrl: "/augment.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Save an Augment Cookie header or set AUGMENT_COOKIE_HEADER before probing.",
  lines: [],
  primaryCandidates: [],
}

const vertexAiPlugin = {
  id: "vertex-ai",
  name: "Vertex AI",
  iconUrl: "/vertex-ai.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Uses gcloud application-default credentials and Cloud Monitoring quota data.",
  lines: [],
  primaryCandidates: [],
}

const antigravityPlugin = {
  id: "antigravity",
  name: "Antigravity",
  iconUrl: "/antigravity.svg",
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
    expect(
      screen.getByText(/For dashboard history, open https:\/\/chatgpt\.com\/codex\/cloud\/settings\/analytics/)
    ).toBeInTheDocument()
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

    const input = screen.getByLabelText("OpenCode Zen Workspace ID")
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

    await userEvent.selectOptions(screen.getByLabelText("OpenCode Zen source"), "auto")

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
    expect(screen.getByText(/This is separate from the OpenCode Go subscription\./)).toBeInTheDocument()
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

    expect(screen.getByText("OpenCode")).toBeInTheDocument()
    expect(screen.getByText(/Tracks OpenCode Go subscription limit usage from local OpenCode history and can show the Zen pay-as-you-go balance/)).toBeInTheDocument()
    expect(screen.getByText(/For Zen balance, open https:\/\/opencode.ai/i)).toBeInTheDocument()
    expect(screen.getByLabelText("OpenCode Cookie header")).toBeInTheDocument()
    expect(screen.getByLabelText("OpenCode Workspace ID")).toBeInTheDocument()
  })

  it("shows explicit OpenRouter management-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={openrouterPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches OpenRouter credits and key-rate data from a stored management key or OPENROUTER_API_KEY\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a management key in the OpenRouter dashboard/i)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the credits and key endpoints\./)).toBeInTheDocument()
  })

  it("shows optional Copilot billing scope guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={copilotPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/optional organization or enterprise premium-request billing scope/i)).toBeInTheDocument()
    expect(screen.getByText(/org:ORG or enterprise:SLUG/)).toBeInTheDocument()
    expect(screen.getByLabelText("Copilot Billing scope")).toBeInTheDocument()
  })

  it("shows explicit Kimi K2 API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={kimiK2Plugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Kimi K2 credits from a stored API key or KIMI_K2_API_KEY-compatible env vars\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a Kimi K2 API key at https:\/\/kimi\.moonshot\.cn, save it here or set KIMI_K2_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the credits endpoint\./)).toBeInTheDocument()
  })

  it("shows explicit Kilo API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={kiloPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Kilo usage from a stored API key or KILO_API_KEY\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a Kilo API key at https:\/\/kilo\.com, save it here or set KILO_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the Kilo tRPC usage endpoint\./)).toBeInTheDocument()
  })

  it("shows explicit Warp token guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={warpPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Warp request limits from a stored token or WARP_API_KEY-compatible env vars\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a Warp API key in Warp Settings -> Platform -> API Keys, save it here or set WARP_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the request-limit GraphQL endpoint\./)).toBeInTheDocument()
  })

  it("shows explicit Zed local-telemetry guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={zedPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Zed dashboard billing spend from a signed-in dashboard Cookie header, then replays that session inside an embedded browser context\./)).toBeInTheDocument()
    expect(screen.getByText(/Open the Zed AI Usage page at https:\/\/dashboard\.zed\.dev\/org_<id>\/billing\/usage, open DevTools -> Network, click the usage request, copy only the Cookie value/)).toBeInTheDocument()
    expect(screen.getByText(/Zed billing spend uses a live browser-backed dashboard request; local telemetry remains the fallback\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Zed Cookie header")).toBeInTheDocument()
  })

  it("shows no editable inputs for auto-detected providers", () => {
    render(
      <ProviderSettingsDetail
        plugin={cursorPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText("This provider currently relies on local auto-detection and does not expose editable settings yet.")).toBeInTheDocument()
    expect(screen.queryByLabelText("Cursor source")).not.toBeInTheDocument()
  })

  it("shows explicit Synthetic API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={syntheticPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Synthetic quota data from a stored API key or SYNTHETIC_API_KEY\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a Synthetic API key at https:\/\/api\.synthetic\.new, save it here or set SYNTHETIC_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the quotas endpoint\./)).toBeInTheDocument()
  })

  it("shows explicit Augment cookie guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={augmentPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Augment credit usage from the signed-in web session using a manual Cookie header or AUGMENT_COOKIE_HEADER\./)).toBeInTheDocument()
    expect(screen.getByText(/copy the full Cookie request header, paste it here, then retry\. Do not paste Set-Cookie\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Augment Cookie header")).toBeInTheDocument()
  })

  it("shows explicit Vertex AI gcloud guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={vertexAiPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Detected from gcloud application-default credentials and Cloud Monitoring quota metrics\./)).toBeInTheDocument()
    expect(screen.getByText(/gcloud auth application-default login/)).toBeInTheDocument()
    expect(screen.getByText(/GOOGLE_CLOUD_PROJECT/)).toBeInTheDocument()
  })

  it("shows explicit Antigravity offline guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={antigravityPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Stored credentials keep working after a one-time sign-in/i)).toBeInTheDocument()
    expect(screen.getByText(/Open Antigravity locally once to sign in, then UsageBar can keep reading the stored credentials even after the IDE closes\./i)).toBeInTheDocument()
  })
})
