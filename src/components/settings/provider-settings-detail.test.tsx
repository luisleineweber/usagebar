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

const claudePlugin = {
  id: "claude",
  name: "Claude",
  iconUrl: "/claude.svg",
  lines: [],
  primaryCandidates: [],
}

const deepseekPlugin = {
  id: "deepseek",
  name: "DeepSeek",
  iconUrl: "/deepseek.svg",
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

const codebuffPlugin = {
  id: "codebuff",
  name: "Codebuff",
  iconUrl: "/codebuff.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Use a stored Codebuff API token, CODEBUFF_API_KEY, or codebuff login credentials to fetch credits and weekly rate limits.",
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
  name: "Moonshot API Balance",
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

const kimiPlugin = {
  id: "kimi",
  name: "Kimi Code (Moonshot)",
  iconUrl: "/kimi.svg",
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
  supportMessage: "Windows experimental. Run `auggie login` for local auth detection; save an Augment Cookie header for dashboard credit usage.",
  lines: [],
  primaryCandidates: [],
}

const alibabaPlugin = {
  id: "alibaba",
  name: "Alibaba Coding Plan",
  iconUrl: "/alibaba.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Save an Alibaba API key in Setup or set ALIBABA_API_KEY, then use ALIBABA_REGION if you need a non-default region.",
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

const zaiPlugin = {
  id: "zai",
  name: "Z.ai",
  iconUrl: "/zai.svg",
  supportState: "experimental" as const,
  supportMessage: "Experimental on Windows. Save a Z.ai API key in Setup, or set ZAI_API_KEY / GLM_API_KEY before launching UsageBar.",
  lines: [],
  primaryCandidates: [],
}

const minimaxPlugin = {
  id: "minimax",
  name: "MiniMax",
  iconUrl: "/minimax.svg",
  supportState: "experimental" as const,
  supportMessage: "Experimental on Windows. Save a MiniMax API key in Setup, or set MINIMAX_API_KEY / MINIMAX_CN_API_KEY before launching UsageBar.",
  lines: [],
  primaryCandidates: [],
}

const ampPlugin = {
  id: "amp",
  name: "Amp",
  iconUrl: "/amp.svg",
  supportState: "experimental" as const,
  supportMessage: "Windows experimental. Save an Amp API key in Setup, or run amp login so UsageBar can read local Amp credentials.",
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
    expect(screen.getByText(/Install Codex CLI, sign in on this machine, then retry\./)).toBeInTheDocument()
    expect(screen.queryByText(/copy the Cookie request header from DevTools/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText("Codex Dashboard Cookie header")).toBeInTheDocument()
  })

  it("shows Claude OAuth-first guidance while keeping web cookie fallback editable", () => {
    render(
      <ProviderSettingsDetail
        plugin={claudePlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Run `claude` CLI and sign in on this machine, then retry\./)).toBeInTheDocument()
    expect(screen.queryByText(/copy the Cookie request header containing sessionKey from DevTools/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText("Claude Claude web Cookie header")).toBeInTheDocument()
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

  it("shows Ollama Cloud auth detection guidance while keeping settings cookie editable", () => {
    render(
      <ProviderSettingsDetail
        plugin={ollamaPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Reads Ollama settings-page quota from a stored cookie header and can detect Cloud auth/)).toBeInTheDocument()
    expect(screen.getByText(/Run `ollama signin` or set OLLAMA_API_KEY to confirm Cloud auth/)).toBeInTheDocument()
    expect(screen.getByText(/settings-page quota percentages/)).toBeInTheDocument()
    expect(screen.getByLabelText("Ollama Cookie header")).toBeInTheDocument()
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
    expect(screen.getByText(/Tracks OpenCode Go subscription limit usage from local OpenCode auth and SQLite history\./)).toBeInTheDocument()
    expect(screen.getByText(/~\/\.local\/share\/opencode\/auth\.json and ~\/\.local\/share\/opencode\/opencode\.db exist/)).toBeInTheDocument()
    expect(screen.queryByLabelText("OpenCode Cookie header")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("OpenCode Workspace ID")).not.toBeInTheDocument()
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

  it("shows explicit DeepSeek API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={deepseekPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches DeepSeek API balance from a stored API key or DEEPSEEK_API_KEY-compatible env vars\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a DeepSeek API key in the platform dashboard, save it here or set DEEPSEEK_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for https:\/\/api\.deepseek\.com\/user\/balance\./)).toBeInTheDocument()
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

  it("shows explicit Codebuff API-token guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={codebuffPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Codebuff credit balance and weekly rate limits from a stored API token, CODEBUFF_API_KEY, or local codebuff login credentials\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a Codebuff API key at https:\/\/www\.codebuff\.com\/api-keys/)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for Codebuff usage and subscription endpoints\./)).toBeInTheDocument()
  })

  it("shows explicit Moonshot API balance guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={kimiK2Plugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches official Kimi Open Platform API balance from Moonshot using a stored API key or MOONSHOT_API_KEY-compatible env vars\. This is separate from the Kimi Code subscription provider\./)).toBeInTheDocument()
    expect(screen.getByText(/It calls https:\/\/api\.moonshot\.ai\/v1\/users\/me\/balance and does not read kimi\.com memberships or Kimi Code CLI quotas\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for https:\/\/api\.moonshot\.ai\/v1\/users\/me\/balance\./)).toBeInTheDocument()
  })

  it("shows unified Kimi Code and Moonshot API balance guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={kimiPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Tracks Kimi CLI \/ kimi\.com membership quota from local `kimi login` OAuth and can also show official Moonshot API billing balance from an API key\./)).toBeInTheDocument()
    expect(screen.getByText(/Run `kimi login` for session and weekly quota; save a Moonshot API key only if you also want official API billing balance\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Kimi Code (Moonshot) Moonshot API key")).toBeInTheDocument()
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

    expect(screen.getByText(/Fetches Warp request limits from a stored token or WARP_API_KEY-compatible env vars through an undocumented app endpoint\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a Warp API key in Warp Settings -> Platform -> API Keys, save it here or set WARP_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the undocumented request-limit GraphQL endpoint\./)).toBeInTheDocument()
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

    expect(screen.getByText(/Detects local Auggie auth and fetches dashboard credit usage from a signed-in web session Cookie header\./)).toBeInTheDocument()
    expect(screen.getByText(/Run `auggie login` to confirm local Augment auth/)).toBeInTheDocument()
    expect(screen.getByLabelText("Augment Cookie header")).toBeInTheDocument()
  })

  it("shows explicit Alibaba Coding Plan API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={alibabaPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches 5-hour, weekly, and monthly Coding Plan request quotas from a stored API key or ALIBABA_API_KEY/)).toBeInTheDocument()
    expect(screen.getByText(/Create a Coding Plan API key, save it here or set ALIBABA_API_KEY, then retry/)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the Coding Plan quotas endpoint\./)).toBeInTheDocument()
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

  it("shows explicit Z.ai API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={zaiPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Z\.ai GLM Coding quota data from a stored API key, ZAI_API_KEY, or GLM_API_KEY\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a Z\.ai API key in the console, save it here or set ZAI_API_KEY \/ GLM_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the subscription and quota endpoints\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Z.ai API key")).toBeInTheDocument()
  })

  it("shows explicit MiniMax API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={minimaxPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches MiniMax Coding Plan quota data from a stored API key or MiniMax environment variables\./)).toBeInTheDocument()
    expect(screen.getByText(/Create a MiniMax API key, save it here or set MINIMAX_API_KEY \/ MINIMAX_CN_API_KEY, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the Coding Plan remains endpoint\./)).toBeInTheDocument()
    expect(screen.getByLabelText("MiniMax API key")).toBeInTheDocument()
  })

  it("shows explicit Amp API-key guidance", () => {
    render(
      <ProviderSettingsDetail
        plugin={ampPlugin}
        enabled
        state={{ data: null, loading: false, error: null, lastManualRefreshAt: null, lastSuccessAt: null }}
        onEnabledChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Fetches Amp balance from a stored API key or the local Amp CLI secrets file\./)).toBeInTheDocument()
    expect(screen.getByText(/Save an Amp API key here, or install Amp Code CLI and run `amp login`, then retry\./)).toBeInTheDocument()
    expect(screen.getByText(/UsageBar stores it in the app credential vault and uses it for the Amp internal balance endpoint\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Amp API key")).toBeInTheDocument()
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
