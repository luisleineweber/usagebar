import { LazyStore } from "@tauri-apps/plugin-store"

export type ProviderSourceMode = "auto" | "manual"

export type ProviderSecretMetadata = {
  updatedAt: number
}

export type ProviderConfig = {
  source?: ProviderSourceMode
  workspaceId?: string
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
    hint: "Paste a Cookie header from the OpenCode billing page.",
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
    title: "OpenCode Setup",
    summary: "CodexBar-style source selection with secure manual cookie storage.",
    statusHint: "Manual mode is the reliable path in this Windows-first build.",
    connectHint: "Open OpenCode billing, copy the browser Cookie header, paste it here, then retry. Add a workspace override if auto-discovery misses the right team.",
    sourceOptions: OPENCODE_SOURCE_OPTIONS,
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the full Cookie header captured from opencode.ai/workspace/.../billing.",
      placeholder: "auth=...; __Host-auth=...;",
    },
    textField: {
      key: "workspaceId",
      label: "Workspace ID",
      description: "Optional override when workspace lookup fails.",
      placeholder: "wrk_...",
    },
  },
  codex: {
    mode: "detected",
    title: "Codex Setup",
    summary: "Current plugin reads local auth data and refreshes it automatically.",
    statusHint: "Manual web-cookie input is not exposed yet because the plugin auth shape is richer than a single token.",
    connectHint: "Install Codex CLI, sign in on this machine, then retry the provider check.",
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
    summary: "Current plugin reads WorkOS-backed auth from file or keychain and refreshes it.",
    statusHint: "Setup is read-only for now so the refresh lifecycle stays consistent.",
    connectHint: "Sign in to Factory or Droid locally so the plugin can detect the stored WorkOS credentials.",
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
    summary: "Detected from the local app/session state.",
    statusHint: "Manual configuration is not required in the current plugin.",
    connectHint: "Open Windsurf, complete sign-in once on this machine, then refresh.",
  },
  kimi: {
    mode: "automatic",
    title: "Kimi Setup",
    summary: "Detected from local auth state and refreshed automatically.",
    statusHint: "Manual auth editing can come later if needed.",
    connectHint: "Sign in to Kimi Code locally, then retry the provider check.",
  },
  minimax: {
    mode: "automatic",
    title: "MiniMax Setup",
    summary: "Detected from local API/cookie sources used by the plugin.",
    statusHint: "No extra controls are exposed yet.",
    connectHint: "Sign in to MiniMax on this machine so the local session can be detected.",
  },
  antigravity: {
    mode: "automatic",
    title: "Antigravity Setup",
    summary: "Detected from local process state, SQLite, and OAuth refresh data.",
    statusHint: "This provider is auto-detected when the local app/session is present.",
    connectHint: "Open Antigravity locally and finish sign-in once, then refresh.",
  },
  perplexity: {
    mode: "automatic",
    title: "Perplexity Setup",
    summary: "Detected from the local app cache.",
    statusHint: "No manual configuration is required in the current plugin.",
    connectHint: "Sign in to Perplexity on this machine so the local cache contains an active session.",
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
    summary: "Detected from available local/session credentials.",
    statusHint: "Manual provider controls are not exposed yet.",
    connectHint: "Sign in to Z.ai locally, then refresh.",
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
  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
    ? raw.updatedAt
    : undefined
  const secrets = sanitizeSecretMetadata(raw.secrets)

  return {
    source,
    workspaceId,
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
  return "Auto-detected"
}
