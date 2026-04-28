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
    title: "OpenCode Zen Setup",
    summary: "Tracks OpenCode Zen pay-as-you-go billing usage from the signed-in workspace session. This is separate from the OpenCode Go subscription.",
    statusHint: "Manual mode is the reliable path in this Windows-first build.",
    connectHint: "Use this for OpenCode Zen pay-as-you-go usage. Sign in at https://opencode.ai, open the target workspace billing page, then copy the full Cookie request header from DevTools > Network for the billing page or an opencode.ai/_server request. Paste that here, then add a workspace override only if auto-discovery picks the wrong team.",
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
    summary: "Tracks OpenCode Go subscription limit usage from the local OpenCode auth file and SQLite history on this machine.",
    statusHint: "No manual setup is required once the Go subscription has local auth or opencode.db history.",
    connectHint: "Install OpenCode Go, sign in on this machine, then retry.",
  },
  codex: {
    mode: "editable",
    title: "Codex Setup",
    summary: "Tracks Codex CLI usage from local auth, app-managed imported accounts, and optional OpenAI dashboard history from a signed-in dashboard Cookie header.",
    statusHint: "Import the current local Codex login into a managed profile to pin an account, or add a dashboard cookie to show OpenAI web usage breakdown and credits history.",
    connectHint: "Install Codex CLI and sign in on this machine. For dashboard history, open https://chatgpt.com/codex/cloud/settings/analytics while signed in, copy the Cookie request header from DevTools, paste it here, then retry.",
    secretField: {
      key: "cookieHeader",
      label: "Dashboard Cookie header",
      description: "Paste the full Cookie request header from a signed-in chatgpt.com Codex dashboard request. Do not paste Set-Cookie.",
      placeholder: "__Secure-next-auth.session-token=...; cf_clearance=...;",
    },
  },
  claude: {
    mode: "editable",
    title: "Claude Setup",
    summary: "Uses local Claude OAuth credentials first, then can fall back to a signed-in claude.ai web session Cookie header and local ccusage history.",
    statusHint: "Local OAuth remains preferred. Add a Claude web cookie when CLI OAuth usage is unavailable but claude.ai is signed in.",
    connectHint: "Run `claude` CLI and sign in on this machine. For web fallback, open https://claude.ai while signed in, copy the Cookie request header containing sessionKey from DevTools, paste it here, then retry.",
    secretField: {
      key: "cookieHeader",
      label: "Claude web Cookie header",
      description: "Paste the full Cookie request header from claude.ai. It must include sessionKey. Do not paste Set-Cookie.",
      placeholder: "sessionKey=sk-ant-...;",
    },
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
    connectHint: "Install the Factory CLI (`droid`), sign in, restart UsageBar if needed, then retry.",
  },
  gemini: {
    mode: "automatic",
    title: "Gemini Setup",
    summary: "Detected from Gemini CLI OAuth credentials.",
    statusHint: "No manual setup is required once Gemini CLI is signed in.",
    connectHint: "Install Gemini CLI, run `gemini` and sign in, then retry.",
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
    connectHint: "Install Amp Code CLI, run `amp login`, then retry.",
  },
  windsurf: {
    mode: "automatic",
    title: "Windsurf Setup",
    summary: "Detected from local Windsurf sign-in state and refreshed from the Windsurf cloud quota endpoint.",
    statusHint: "The current plugin reads the local auth DB automatically; no manual token field is exposed.",
    connectHint: "Sign in to Windsurf once on this machine, then refresh to fetch the current daily and weekly quota state.",
  },
  zed: {
    mode: "editable",
    title: "Zed Setup",
    summary: "Fetches Zed dashboard billing spend from a signed-in dashboard Cookie header, then replays that session inside an embedded browser context. When no billing cookie is configured, the provider falls back to local Zed-hosted telemetry totals.",
    statusHint: "Windows experimental. Billing spend now uses a live browser-backed dashboard request instead of a pasted JSON snapshot. The local Zed client token alone still does not unlock the billing API.",
    connectHint: "Open the Zed AI Usage page at https://dashboard.zed.dev/org_<id>/billing/usage, open DevTools -> Network, click the usage request, copy only the Cookie value from Headers -> Request Headers, paste it here, then retry. Do not paste Set-Cookie or the dashboard URL.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie request header value from the signed-in Zed AI Usage page's usage request. UsageBar replays it through an embedded browser context. Do not paste Set-Cookie, the full Headers panel, or the dashboard URL.",
      placeholder: "zed.session=...; __cf_bm=...; c15t=...;",
    },
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
  abacus: {
    mode: "editable",
    title: "Abacus AI Setup",
    summary: "Fetches Abacus AI compute-point usage from the signed-in web session using a manual Cookie header or ABACUS_COOKIE_HEADER.",
    statusHint: "Manual cookie or env mode is the supported Windows path in this build.",
    connectHint: "Open a signed-in Abacus AI compute-points usage request in DevTools, copy the full Cookie request header, paste it here, then retry. Do not paste Set-Cookie.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie header from a signed-in apps.abacus.ai request. Do not paste Set-Cookie.",
      placeholder: "sessionid=...; session_token=...;",
    },
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
  mistral: {
    mode: "editable",
    title: "Mistral Setup",
    summary: "Fetches current-month Mistral billing usage from the signed-in admin session using a manual Cookie header or MISTRAL_COOKIE_HEADER.",
    statusHint: "Manual cookie or env mode is the supported Windows path in this build.",
    connectHint: "Open https://admin.mistral.ai/organization/usage while signed in, copy the full Cookie request header from the billing usage request, paste it here, then retry. Do not paste Set-Cookie.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie request header from a signed-in admin.mistral.ai usage request. Do not paste Set-Cookie.",
      placeholder: "ory_session_...=...; csrftoken=...;",
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
  augment: {
    mode: "editable",
    title: "Augment Setup",
    summary: "Fetches Augment credit usage from the signed-in web session using a manual Cookie header or AUGMENT_COOKIE_HEADER.",
    statusHint: "Manual cookie or env mode is the supported Windows path in this build.",
    connectHint: "Open a signed-in app.augmentcode.com subscription or credits request in DevTools, copy the full Cookie request header, paste it here, then retry. Do not paste Set-Cookie.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie request header from a signed-in app.augmentcode.com request. Do not paste Set-Cookie.",
      placeholder: "_session=...; authjs.session-token=...;",
    },
  },
  alibaba: {
    mode: "editable",
    title: "Alibaba Coding Plan Setup",
    summary: "Fetches daily and weekly Coding Plan quotas from a stored API key or ALIBABA_API_KEY, with optional ALIBABA_REGION override.",
    statusHint: "Save an Alibaba API key here or set ALIBABA_API_KEY before launching UsageBar. Default region is cn-beijing unless ALIBABA_REGION is set.",
    connectHint: "Create an Alibaba API key, save it here or set ALIBABA_API_KEY, then retry. Set ALIBABA_REGION if your account uses a non-default region.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "Paste an Alibaba API key. UsageBar stores it in the app credential vault and uses it for the Coding Plan quotas endpoint.",
      placeholder: "ali_...",
    },
  },
  kilo: {
    mode: "editable",
    title: "Kilo Setup",
    summary: "Fetches Kilo usage from a stored API key or KILO_API_KEY. CLI-session fallback is still deferred in this Windows-first build.",
    statusHint: "Save a Kilo API key here or set KILO_API_KEY before launching UsageBar.",
    connectHint: "Create a Kilo API key at https://kilo.com, save it here or set KILO_API_KEY, then retry.",
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
    connectHint: "Create a Kimi K2 API key at https://kimi.moonshot.cn, save it here or set KIMI_K2_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "Paste a Kimi K2 API key. UsageBar stores it in the app credential vault and uses it for the credits endpoint.",
      placeholder: "kimi_...",
    },
  },
  kiro: {
    mode: "automatic",
    title: "Kiro Setup",
    summary: "Reads local Kiro auth and cache state, then refreshes live usage from the Kiro usage endpoint when the desktop session is present.",
    statusHint: "Open Kiro and sign in on this machine so UsageBar can read the local auth token, profile, and usage cache.",
    connectHint: "Open Kiro, sign in, and load the Kiro account dashboard once, then retry.",
  },
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
    connectHint: "Create a Synthetic API key at https://api.synthetic.new, save it here or set SYNTHETIC_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "Paste a Synthetic API key. UsageBar stores it in the app credential vault and uses it for the quotas endpoint.",
      placeholder: "synthetic_...",
    },
  },
  "vertex-ai": {
    mode: "automatic",
    title: "Vertex AI Setup",
    summary: "Detected from gcloud application-default credentials and Cloud Monitoring quota metrics.",
    statusHint: "Run `gcloud auth application-default login` and configure a project before launching UsageBar.",
    connectHint: "Run `gcloud auth application-default login`, then `gcloud config set project PROJECT_ID` or set GOOGLE_CLOUD_PROJECT, and ensure the project allows Cloud Monitoring time-series reads.",
  },
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
  if (providerId === "abacus") return "Manual cookie"
  if (providerId === "augment") return "Manual cookie"
  if (providerId === "claude") return config?.secrets?.cookieHeader ? "OAuth + web cookie" : "Auto-detected"
  if (providerId === "codex") {
    if (config?.selectedAccountProfileId && config?.secrets?.cookieHeader) return "Managed account + dashboard cookie"
    if (config?.selectedAccountProfileId) return "Managed account"
    if (config?.secrets?.cookieHeader) return "Auto-detected + dashboard cookie"
    return "Auto-detected"
  }
  return "Auto-detected"
}
