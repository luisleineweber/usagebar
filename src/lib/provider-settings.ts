import { LazyStore } from "@tauri-apps/plugin-store"

export type ProviderSourceMode = "auto" | "manual"

export type ProviderSecretMetadata = {
  updatedAt: number
}

export type ProviderConfig = {
  source?: ProviderSourceMode
  workspaceId?: string
  selectedAccountProfileId?: string
  secrets?: Record<string, ProviderSecretMetadata>
  updatedAt?: number
}

export type ProviderConfigs = Record<string, ProviderConfig>

export type ProviderSettingsMode = "editable" | "detected" | "automatic"

export type ProviderSettingsOption = {
  value: ProviderSourceMode
  label: string
  hint: string
}

export type ProviderSettingsDefinition = {
  mode: ProviderSettingsMode
  title: string
  summary: string
  statusHint: string
  connectHint?: string
  sourceOptions?: ProviderSettingsOption[]
  secretField?: {
    key: string
    label: string
    description: string
    placeholder: string
  }
  textField?: {
    key: "workspaceId"
    label: string
    description: string
    placeholder: string
  }
}

const SETTINGS_STORE_PATH = "settings.json"
const PROVIDER_CONFIGS_KEY = "providerConfigs"

const store = new LazyStore(SETTINGS_STORE_PATH)

const OPENCODE_SOURCE_OPTIONS: ProviderSettingsOption[] = [
  {
    value: "manual",
    label: "Manual",
    hint: "Paste the full Cookie request header from a signed-in opencode.ai workspace billing or _server request.",
  },
  {
    value: "auto",
    label: "Automatic",
    hint: "Browser import is planned, but not wired up on Windows yet.",
  },
]

function plannedWindowsProviderDefinition(
  title: string,
  summary: string,
  connectHint: string
): ProviderSettingsDefinition {
  return {
    mode: "automatic",
    title,
    summary,
    statusHint: "Windows placeholder only. Probing stays disabled until the provider implementation lands.",
    connectHint,
  }
}

const PROVIDER_SETTINGS_DEFINITIONS: Record<string, ProviderSettingsDefinition> = {
  ollama: {
    mode: "editable",
    title: "Ollama Setup",
    summary: "Reads Ollama Cloud Usage from the web settings page using a stored cookie header.",
    statusHint: "Manual cookie mode is the only supported Ollama setup in this Windows-first build.",
    connectHint: "Open https://ollama.com/settings, copy the browser Cookie header, paste it here, then retry.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie header captured while signed in at https://ollama.com/settings.",
      placeholder: "session=...; __Secure-next-auth.session-token=...;",
    },
  },
  opencode: {
    mode: "editable",
    title: "OpenCode Setup",
    summary: "Tracks OpenCode web subscription usage from the signed-in workspace billing session. This is separate from OpenCode Go local CLI spend.",
    statusHint: "Manual mode is the reliable path in this Windows-first build.",
    connectHint: "Sign in at https://opencode.ai, open the target workspace billing page, then copy the full Cookie request header from DevTools > Network for the billing page or an opencode.ai/_server request. Paste that here, then add a workspace override only if auto-discovery picks the wrong team.",
    sourceOptions: OPENCODE_SOURCE_OPTIONS,
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie request header from a signed-in opencode.ai/workspace/.../billing or opencode.ai/_server request. Do not paste Set-Cookie.",
      placeholder: "auth=...; __Host-auth=...; other_cookie=...;",
    },
    textField: {
      key: "workspaceId",
      label: "Workspace ID",
      description: "Optional override when workspace lookup fails or your account has multiple teams. Paste the wrk_... ID from the billing URL or an _server payload.",
      placeholder: "wrk_...",
    },
  },
  "opencode-go": {
    mode: "automatic",
    title: "OpenCode Go Setup",
    summary: "Detected from the local OpenCode auth file and SQLite history on this machine.",
    statusHint: "No manual setup is required once ~/.local/share/opencode/auth.json or local opencode.db history exists.",
    connectHint: "Use OpenCode Go on this machine so ~/.local/share/opencode/auth.json or ~/.local/share/opencode/opencode.db exists, then retry.",
  },
  codex: {
    mode: "detected",
    title: "Codex Setup",
    summary: "Tracks Codex CLI usage from local auth and now supports app-managed imported accounts.",
    statusHint: "Import the current local Codex login into a managed profile when you want to pin UsageBar to a specific account.",
    connectHint: "Install Codex CLI, sign in on this machine, then import the detected login into a managed profile if you want account pinning.",
  },
  claude: {
    mode: "detected",
    title: "Claude Setup",
    summary: "Current plugin uses local Claude OAuth credentials and refresh flow.",
    statusHint: "The app shows runtime status here before adding editable auth controls.",
    connectHint: "Sign in to Claude locally so OpenUsage can read the existing OAuth session.",
  },
  cursor: {
    mode: "detected",
    title: "Cursor Setup",
    summary: "Current plugin resolves auth from local state DB or keychain.",
    statusHint: "Source/status is visible here; manual token editing is deferred until refresh persistence is modeled.",
    connectHint: "Open Cursor and sign in on this machine, then refresh to detect the saved auth state.",
  },
  factory: {
    mode: "detected",
    title: "Factory Setup",
    summary: "Reads WorkOS-backed auth from the local droid auth store or keychain and refreshes it automatically.",
    statusHint: "Run `droid` so ~/.factory/auth.v2.file plus ~/.factory/auth.v2.key exists before launching UsageBar. Legacy auth.encrypted and auth.json still work.",
    connectHint: "Run `droid` on this machine, restart UsageBar if needed, then retry the provider check.",
  },
  gemini: {
    mode: "automatic",
    title: "Gemini Setup",
    summary: "Detected from Gemini CLI OAuth credentials.",
    statusHint: "No manual setup is required once Gemini CLI is signed in.",
    connectHint: "Run Gemini CLI sign-in on this machine, then retry.",
  },
  copilot: {
    mode: "automatic",
    title: "Copilot Setup",
    summary: "Detected from OpenUsage keychain cache or gh CLI auth.",
    statusHint: "Run gh auth login if Copilot is missing.",
    connectHint: "Run gh auth login or sign in to Copilot locally, then refresh.",
  },
  amp: {
    mode: "automatic",
    title: "Amp Setup",
    summary: "Detected from the local Amp CLI secrets file.",
    statusHint: "No provider-specific controls are needed yet.",
    connectHint: "Sign in to Amp on this machine so its local secrets file is available.",
  },
  windsurf: {
    mode: "automatic",
    title: "Windsurf Setup",
    summary: "Detected from local Windsurf sign-in state and refreshed from the Windsurf cloud quota endpoint.",
    statusHint: "The current plugin reads the local auth DB automatically; no manual token field is exposed.",
    connectHint: "Sign in to Windsurf once on this machine, then refresh to fetch the current daily and weekly quota state.",
  },
  kimi: {
    mode: "automatic",
    title: "Kimi Setup",
    summary: "Detected from the local Kimi Code credential file and refreshed automatically.",
    statusHint: "Run `kimi login` so ~/.kimi/credentials/kimi-code.json exists before launching UsageBar.",
    connectHint: "Run `kimi login` on this machine, restart UsageBar if needed, then retry the provider check.",
  },
  minimax: {
    mode: "automatic",
    title: "MiniMax Setup",
    summary: "Detected from MiniMax API keys exposed as user environment variables.",
    statusHint: "Set MINIMAX_API_KEY or MINIMAX_CN_API_KEY before launching UsageBar.",
    connectHint: "Create a persistent MINIMAX_API_KEY or MINIMAX_CN_API_KEY user environment variable, restart UsageBar, then refresh.",
  },
  antigravity: {
    mode: "automatic",
    title: "Antigravity Setup",
    summary: "Detected from local process state, SQLite, and OAuth refresh data. Stored credentials keep working after a one-time sign-in, even when Antigravity closes.",
    statusHint: "Live LS data is auto-detected while Antigravity is open; stored SQLite/OAuth data keeps working after sign-in.",
    connectHint: "Open Antigravity locally once to sign in, then UsageBar can keep reading the stored credentials even after the IDE closes.",
  },
  perplexity: {
    mode: "editable",
    title: "Perplexity Setup",
    summary: "Fetches Perplexity credit pools from the signed-in billing session using a manual Cookie header or matching env vars.",
    statusHint: "Manual cookie or env mode is the supported Windows path in this build.",
    connectHint: "Open a signed-in perplexity.ai billing request in DevTools, copy the full Cookie request header, paste it here, then retry. Do not paste Set-Cookie.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie request header from a signed-in perplexity.ai billing request. Do not paste Set-Cookie.",
      placeholder: "__Secure-next-auth.session-token=...; pplx_session=...;",
    },
  },
  "jetbrains-ai-assistant": {
    mode: "automatic",
    title: "JetBrains AI Setup",
    summary: "Detected from the local IDE environment.",
    statusHint: "This provider currently relies on auto-detection only.",
    connectHint: "Sign in through JetBrains AI Assistant in your IDE, then retry.",
  },
  zai: {
    mode: "automatic",
    title: "Z.ai Setup",
    summary: "Detected from Z.ai API keys exposed as user environment variables.",
    statusHint: "Set ZAI_API_KEY or GLM_API_KEY before launching UsageBar.",
    connectHint: "Create a persistent ZAI_API_KEY or GLM_API_KEY user environment variable, restart UsageBar, then refresh.",
  },
  augment: plannedWindowsProviderDefinition(
    "Augment Setup",
    "Planned Windows implementation: detect local Augment app or CLI session state first, then add a provider-specific local probe before considering any web flow.",
    "Target plan: reuse local process or CLI auth on Windows instead of browser-cookie scraping."
  ),
  alibaba: plannedWindowsProviderDefinition(
    "Alibaba Coding Plan Setup",
    "Windows placeholder. Planned implementation: start with an app-owned Alibaba session or API-key path for Coding Plan quota, then add provider-specific region handling.",
    "Target plan: add secure API-key and session support later; probing stays disabled until the Windows implementation lands."
  ),
  kilo: {
    mode: "editable",
    title: "Kilo Setup",
    summary: "Fetches Kilo usage from a stored API key or KILO_API_KEY. CLI-session fallback is still deferred in this Windows-first build.",
    statusHint: "Save a Kilo API key here or set KILO_API_KEY before launching UsageBar.",
    connectHint: "Create a Kilo API key, save it here or set KILO_API_KEY, then retry. Local kilo login fallback is planned but not wired yet.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "Paste a Kilo API key. UsageBar stores it in the app credential vault and uses it for the Kilo tRPC usage endpoint.",
      placeholder: "kilo_...",
    },
  },
  "kimi-k2": {
    mode: "editable",
    title: "Kimi K2 Setup",
    summary: "Fetches Kimi K2 credits from a stored API key or KIMI_K2_API_KEY-compatible env vars.",
    statusHint: "Save a Kimi K2 API key here or set KIMI_K2_API_KEY, KIMI_API_KEY, or KIMI_KEY before launching UsageBar.",
    connectHint: "Create a Kimi K2 API key, save it here or set KIMI_K2_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "Paste a Kimi K2 API key. UsageBar stores it in the app credential vault and uses it for the credits endpoint.",
      placeholder: "kimi_...",
    },
  },
  kiro: plannedWindowsProviderDefinition(
    "Kiro Setup",
    "Planned Windows implementation: execute the local Kiro CLI usage command and parse its output instead of building a browser-session path.",
    "Target plan: rely on CLI detection and parsing on Windows while that command remains available."
  ),
  openrouter: {
    mode: "editable",
    title: "OpenRouter Setup",
    summary: "Fetches OpenRouter credits and key-rate data from a stored API key or OPENROUTER_API_KEY.",
    statusHint: "Save an OpenRouter API key here or set OPENROUTER_API_KEY before launching UsageBar.",
    connectHint: "Create an API key at https://openrouter.ai/settings/keys, save it here or set OPENROUTER_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "Paste an OpenRouter API key. UsageBar stores it in the app credential vault and uses it for the credits and key endpoints.",
      placeholder: "sk-or-v1-...",
    },
  },
  synthetic: {
    mode: "editable",
    title: "Synthetic Setup",
    summary: "Fetches Synthetic quota data from a stored API key or SYNTHETIC_API_KEY.",
    statusHint: "Save a Synthetic API key here or set SYNTHETIC_API_KEY before launching UsageBar.",
    connectHint: "Create a Synthetic API key, save it here or set SYNTHETIC_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "Paste a Synthetic API key. UsageBar stores it in the app credential vault and uses it for the quotas endpoint.",
      placeholder: "synthetic_...",
    },
  },
  "vertex-ai": plannedWindowsProviderDefinition(
    "Vertex AI Setup",
    "Planned Windows implementation: use Google ADC or gcloud application-default auth plus quota APIs, with optional local-log enrichment later.",
    "Target plan: prefer official Google auth and quota APIs on Windows, not browser-session scraping."
  ),
  warp: {
    mode: "editable",
    title: "Warp Setup",
    summary: "Fetches Warp request limits from a stored token or WARP_API_KEY-compatible env vars.",
    statusHint: "Save a Warp token here or set WARP_API_KEY / WARP_TOKEN before launching UsageBar.",
    connectHint: "Create a Warp API key in Warp Settings -> Platform -> API Keys, save it here or set WARP_API_KEY, then retry.",
    secretField: {
      key: "token",
      label: "Token",
      description: "Paste a Warp API key. UsageBar stores it in the app credential vault and uses it for the request-limit GraphQL endpoint.",
      placeholder: "wk-...",
    },
  },
}

function sanitizeSecretMetadata(value: unknown): Record<string, ProviderSecretMetadata> {
  if (!value || typeof value !== "object") return {}

  const entries = Object.entries(value)
  const out: Record<string, ProviderSecretMetadata> = {}
  for (const [key, entry] of entries) {
    if (!entry || typeof entry !== "object") continue
    const updatedAt = (entry as ProviderSecretMetadata).updatedAt
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) continue
    out[key] = { updatedAt }
  }
  return out
}

function normalizeProviderConfigEntry(value: unknown): ProviderConfig {
  if (!value || typeof value !== "object") return {}

  const raw = value as ProviderConfig
  const source = raw.source === "manual" || raw.source === "auto" ? raw.source : undefined
  const workspaceId = typeof raw.workspaceId === "string"
    ? raw.workspaceId.trim() || undefined
    : undefined
  const selectedAccountProfileId = typeof raw.selectedAccountProfileId === "string"
    ? raw.selectedAccountProfileId.trim() || undefined
    : undefined
  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
    ? raw.updatedAt
    : undefined
  const secrets = sanitizeSecretMetadata(raw.secrets)

  return {
    source,
    workspaceId,
    selectedAccountProfileId,
    updatedAt,
    secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
  }
}

export function getProviderSettingsDefinition(providerId: string): ProviderSettingsDefinition {
  return PROVIDER_SETTINGS_DEFINITIONS[providerId] ?? {
    mode: "automatic",
    title: "Provider Setup",
    summary: "This provider currently relies on local auto-detection.",
    statusHint: "Manual configuration is not available yet.",
    connectHint: "Sign in to this provider on the same machine, then retry.",
  }
}

export function normalizeProviderConfigs(value: unknown): ProviderConfigs {
  if (!value || typeof value !== "object") return {}

  const out: ProviderConfigs = {}
  for (const [providerId, entry] of Object.entries(value)) {
    out[providerId] = normalizeProviderConfigEntry(entry)
  }
  return out
}

export async function loadProviderConfigs(): Promise<ProviderConfigs> {
  const stored = await store.get<unknown>(PROVIDER_CONFIGS_KEY)
  return normalizeProviderConfigs(stored)
}

export async function saveProviderConfigs(configs: ProviderConfigs): Promise<void> {
  await store.set(PROVIDER_CONFIGS_KEY, configs)
  await store.save()
}

export function updateProviderConfig(
  configs: ProviderConfigs,
  providerId: string,
  patch: Partial<ProviderConfig>
): ProviderConfigs {
  const current = configs[providerId] ?? {}
  const next: ProviderConfig = normalizeProviderConfigEntry({
    ...current,
    ...patch,
    updatedAt: Date.now(),
  })

  return {
    ...configs,
    [providerId]: next,
  }
}

export function setProviderSecretMetadata(
  configs: ProviderConfigs,
  providerId: string,
  secretKey: string
): ProviderConfigs {
  const current = configs[providerId] ?? {}
  const nextSecrets = {
    ...(current.secrets ?? {}),
    [secretKey]: { updatedAt: Date.now() },
  }

  return updateProviderConfig(configs, providerId, {
    secrets: nextSecrets,
  })
}

export function clearProviderSecretMetadata(
  configs: ProviderConfigs,
  providerId: string,
  secretKey: string
): ProviderConfigs {
  const current = configs[providerId] ?? {}
  const nextSecrets = { ...(current.secrets ?? {}) }
  delete nextSecrets[secretKey]

  return updateProviderConfig(configs, providerId, {
    secrets: Object.keys(nextSecrets).length > 0 ? nextSecrets : undefined,
  })
}

export function hasProviderSecret(config: ProviderConfig | undefined, secretKey: string): boolean {
  return Boolean(config?.secrets?.[secretKey])
}

export function getProviderSourceLabel(providerId: string, config: ProviderConfig | undefined): string {
  if (providerId === "opencode") {
    return config?.source === "manual" ? "Manual cookie" : "Automatic"
  }
  if (providerId === "ollama") return "Manual cookie"
  if (providerId === "perplexity") return "Manual cookie"
  if (providerId === "codex") {
    return config?.selectedAccountProfileId ? "Managed account" : "Auto-detected"
  }
  return "Auto-detected"
}
