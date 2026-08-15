import { LazyStore } from "@tauri-apps/plugin-store"

export type ProviderSourceMode = "auto" | "manual"

export type ProviderSecretMetadata = {
  updatedAt: number
}

export type ProviderConfig = {
  source?: ProviderSourceMode
  workspaceId?: string
  selectedAccountProfileId?: string
  browserCookieImportEnabled?: boolean
  historyPath?: string
  pricingMode?: "auto" | "calculate" | "display"
  offlinePricing?: "enabled"
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
  managedAccounts?: boolean
  title: string
  summary: string
  statusHint: string
  connectHint?: string
  browserCookieImport?: {
    description: string
  }
  guidedCookieLogin?: {
    buttonLabel: string
    windowTitle: string
    loginUrl: string
    successUrlContains: string
    cookieUrls: string[]
    secretKey: string
    successMessage: string
  }
  sourceOptions?: ProviderSettingsOption[]
  secretField?: {
    key: string
    label: string
    description: string
    placeholder: string
  }
  additionalSecretField?: {
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
    summary:
      "Reads Ollama settings-page quota from a stored cookie header and can detect Cloud auth from `ollama signin` or OLLAMA_API_KEY.",
    statusHint:
      "Cloud auth can be detected locally, but Session/Weekly quota still needs the settings-page Cookie header.",
    connectHint:
      "Run `ollama signin` or set OLLAMA_API_KEY to confirm Cloud auth. For Session/Weekly quota, open https://ollama.com/settings, copy the browser Cookie header, paste it here, then retry.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description:
        "Paste the full Cookie header captured while signed in at https://ollama.com/settings. This is still required for settings-page quota percentages.",
      placeholder: "session=...; __Secure-next-auth.session-token=...;",
    },
  },
  opencode: {
    mode: "editable",
    title: "OpenCode Zen Setup",
    summary:
      "Tracks OpenCode Zen pay-as-you-go billing usage from the signed-in workspace session. This is separate from the OpenCode Go subscription.",
    statusHint: "Manual mode is the reliable path in this Windows-first build.",
    connectHint:
      "Use this for OpenCode Zen pay-as-you-go usage. Sign in at https://opencode.ai, open the target workspace billing page, then copy the full Cookie request header from DevTools > Network for the billing page or an opencode.ai/_server request. Paste that here, then add a workspace override only if auto-discovery picks the wrong team.",
    sourceOptions: OPENCODE_SOURCE_OPTIONS,
    guidedCookieLogin: {
      buttonLabel: "Connect OpenCode Zen",
      windowTitle: "Connect OpenCode Zen",
      loginUrl: "https://opencode.ai/",
      successUrlContains: "/workspace/",
      cookieUrls: ["https://opencode.ai/"],
      secretKey: "cookieHeader",
      successMessage: "OpenCode Zen session captured. No email or password was stored.",
    },
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description:
        "Paste the full Cookie request header from a signed-in opencode.ai/workspace/.../billing or opencode.ai/_server request. Do not paste Set-Cookie.",
      placeholder: "auth=...; __Host-auth=...; other_cookie=...;",
    },
    textField: {
      key: "workspaceId",
      label: "Workspace ID",
      description:
        "Optional override when workspace lookup fails or your account has multiple teams. Paste the wrk_... ID from the billing URL or an _server payload.",
      placeholder: "wrk_...",
    },
  },
  "opencode-go": {
    mode: "editable",
    title: "OpenCode Setup",
    summary:
      "Tracks account-wide OpenCode Go quota from the official usage API and keeps local history from SQLite and ccusage.",
    statusHint:
      "OpenCode Go quota uses the local opencode-go key. No browser cookie is needed.",
    connectHint:
      "Install OpenCode Go and sign in on this machine so ~/.local/share/opencode/auth.json contains an opencode-go key. SQLite and ccusage provide local history.",
  },
  codex: {
    mode: "editable",
    managedAccounts: true,
    title: "Codex Setup",
    summary:
      "Tracks Codex CLI usage from local auth, app-managed imported accounts, and optional OpenAI dashboard history from a signed-in dashboard Cookie header.",
    statusHint:
      "Install Codex CLI and sign in locally. Dashboard cookies are optional enrichment only.",
    connectHint:
      "Install Codex CLI, sign in on this machine, then retry. Use managed account import if you want to pin a specific local Codex account.",
    secretField: {
      key: "cookieHeader",
      label: "Dashboard Cookie header",
      description:
        "Paste the full Cookie request header from a signed-in chatgpt.com Codex dashboard request. Do not paste Set-Cookie.",
      placeholder: "__Secure-next-auth.session-token=...; cf_clearance=...;",
    },
  },
  claude: {
    mode: "editable",
    managedAccounts: true,
    title: "Claude Setup",
    summary:
      "Uses local Claude OAuth credentials first, then can fall back to a signed-in claude.ai web session Cookie header and local ccusage history.",
    statusHint:
      "Run Claude Code locally and sign in with OAuth. The claude.ai Cookie header is an optional fallback only.",
    connectHint:
      "Run `claude` CLI and sign in on this machine, then retry. UsageBar prefers local Claude OAuth credentials and local usage history.",
    browserCookieImport: {
      description:
        "Opt in to a one-time import of the approved claude.ai session cookie from a selected Microsoft Edge profile. UsageBar does not scan in the background and never returns cookie values to the interface.",
    },
    secretField: {
      key: "cookieHeader",
      label: "Claude web Cookie header",
      description:
        "Paste the full Cookie request header from claude.ai. It must include sessionKey. Do not paste Set-Cookie.",
      placeholder: "sessionKey=sk-ant-...;",
    },
  },
  cursor: {
    mode: "detected",
    title: "Cursor Setup",
    summary: "Current plugin resolves auth from local state DB or keychain.",
    statusHint:
      "Source/status is visible here; manual token editing is deferred until refresh persistence is modeled.",
    connectHint:
      "Open Cursor and sign in on this machine, then refresh to detect the saved auth state.",
  },
  codebuff: {
    mode: "editable",
    title: "Codebuff Setup",
    summary:
      "Fetches Codebuff credit balance and weekly rate limits from a stored API token, CODEBUFF_API_KEY, or local codebuff login credentials.",
    statusHint:
      "Save a Codebuff API token here, set CODEBUFF_API_KEY, or run codebuff login before launching UsageBar.",
    connectHint:
      "Create a Codebuff API key at https://www.codebuff.com/api-keys, save it here or set CODEBUFF_API_KEY. If you use the CLI, run codebuff login so UsageBar can read ~/.config/manicode/credentials.json.",
    secretField: {
      key: "apiKey",
      label: "API token",
      description:
        "Paste a Codebuff API token. UsageBar stores it in the app credential vault and uses it for Codebuff usage and subscription endpoints.",
      placeholder: "cb_...",
    },
  },
  factory: {
    mode: "detected",
    title: "Factory Setup",
    summary:
      "Reads WorkOS-backed auth from the local droid auth store or keychain and refreshes it automatically.",
    statusHint:
      "Run `droid` so ~/.factory/auth.v2.file plus ~/.factory/auth.v2.key exists before launching UsageBar. Legacy auth.encrypted and auth.json still work.",
    connectHint:
      "Install the Factory CLI (`droid`), sign in, restart UsageBar if needed, then retry.",
  },
  gemini: {
    mode: "automatic",
    managedAccounts: true,
    title: "Gemini Setup",
    summary: "Detected from Gemini CLI OAuth credentials.",
    statusHint: "No manual setup is required once Gemini CLI is signed in.",
    connectHint: "Install Gemini CLI, run `gemini` and sign in, then retry.",
  },
  copilot: {
    mode: "editable",
    title: "Copilot Setup",
    summary:
      "Detected from OpenUsage keychain cache or gh CLI auth, showing premium requests plus paid chat quota units when GitHub reports them.",
    statusHint:
      "Run gh auth login if Copilot is missing. For org-managed licenses, set a billing scope such as org:my-org or enterprise:my-enterprise.",
    connectHint:
      "Run gh auth login or sign in to Copilot locally, then refresh. For organization or enterprise billing reports, save a billing scope and use a token with billing/admin read access.",
    textField: {
      key: "workspaceId",
      label: "Billing scope",
      description:
        "Optional. Use org:ORG or enterprise:SLUG to read official premium-request usage from that billing account. Leave blank for personal user billing.",
      placeholder: "org:my-org",
    },
  },
  amp: {
    mode: "editable",
    title: "Amp Setup",
    summary: "Fetches Amp balance from a stored API key or the local Amp CLI secrets file.",
    statusHint:
      "Save an Amp API key here or run `amp login` so UsageBar can read local Amp credentials.",
    connectHint:
      "Save an Amp API key here, or install Amp Code CLI and run `amp login`, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description:
        "Paste an Amp API key. UsageBar stores it in the app credential vault and uses it for the Amp internal balance endpoint.",
      placeholder: "amp_...",
    },
  },
  windsurf: {
    mode: "automatic",
    title: "Windsurf Setup",
    summary:
      "Detected from local Windsurf sign-in state and refreshed from the Windsurf cloud quota endpoint.",
    statusHint:
      "The current plugin reads the local auth DB automatically; no manual token field is exposed.",
    connectHint:
      "Sign in to Windsurf once on this machine, then refresh to fetch the current daily and weekly quota state.",
  },
  zed: {
    mode: "editable",
    title: "Zed Setup",
    summary:
      "Fetches Zed dashboard billing spend from a signed-in dashboard Cookie header, then replays that session inside an embedded browser context. When no billing cookie is configured, the provider falls back to local Zed-hosted telemetry totals.",
    statusHint:
      "Windows experimental. Billing spend now uses a live browser-backed dashboard request instead of a pasted JSON snapshot. The local Zed client token alone still does not unlock the billing API.",
    connectHint:
      "Use guided dashboard login, sign in to Zed in the opened window, then navigate to the Zed AI Usage page. UsageBar stores only the resulting dashboard Cookie header in the app vault.",
    guidedCookieLogin: {
      buttonLabel: "Connect dashboard",
      windowTitle: "Connect Zed dashboard",
      loginUrl: "https://dashboard.zed.dev/account",
      successUrlContains: "/billing/usage",
      cookieUrls: [
        "https://dashboard.zed.dev/account",
        "https://cloud.zed.dev/frontend/billing/usage",
      ],
      secretKey: "cookieHeader",
      successMessage: "Dashboard cookie captured. No email or password was stored.",
    },
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description:
        "Guided login can fill this automatically. Manual fallback: paste the full Cookie request header value from the signed-in Zed AI Usage page's usage request. UsageBar replays it through an embedded browser context. Do not paste Set-Cookie, the full Headers panel, or the dashboard URL.",
      placeholder: "zed.session=...; __cf_bm=...; c15t=...;",
    },
  },
  kimi: {
    mode: "editable",
    title: "Kimi Code (Moonshot) Setup",
    summary:
      "Tracks Kimi CLI / kimi.com membership quota from local `kimi login` OAuth and can also show official Moonshot API billing balance from an API key.",
    statusHint:
      "Run `kimi login` for Kimi Code membership quota. Optionally save a Moonshot/Kimi Open Platform API key here or set MOONSHOT_API_KEY to include API balance.",
    connectHint:
      "Use this single provider for Kimi/Moonshot. Run `kimi login` for session and weekly quota; save a Moonshot API key only if you also want official API billing balance.",
    secretField: {
      key: "apiKey",
      label: "Moonshot API key",
      description:
        "Optional. Paste a Kimi Open Platform API key to include official API balance from https://api.moonshot.ai/v1/users/me/balance.",
      placeholder: "sk-...",
    },
  },
  minimax: {
    mode: "editable",
    title: "MiniMax Setup",
    summary:
      "Fetches MiniMax Coding Plan quota data from a stored API key or MiniMax environment variables.",
    statusHint:
      "Save a MiniMax API key here, set MINIMAX_API_KEY, or set MINIMAX_CN_API_KEY before launching UsageBar.",
    connectHint:
      "Create a MiniMax API key, save it here or set MINIMAX_API_KEY / MINIMAX_CN_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description:
        "Paste a MiniMax API key. UsageBar stores it in the app credential vault and uses it for the Coding Plan remains endpoint.",
      placeholder: "sk-...",
    },
  },
  antigravity: {
    mode: "automatic",
    title: "Antigravity Setup",
    summary:
      "Detected from local process state, SQLite, and OAuth refresh data. Stored credentials keep working after a one-time sign-in, even when Antigravity closes.",
    statusHint:
      "Live LS data is auto-detected while Antigravity is open; stored SQLite/OAuth data keeps working after sign-in.",
    connectHint:
      "Open Antigravity locally once to sign in, then UsageBar can keep reading the stored credentials even after the IDE closes.",
  },
  abacus: {
    mode: "editable",
    title: "Abacus AI Setup",
    summary:
      "Fetches Abacus AI compute-point usage from the signed-in web session using a manual Cookie header or ABACUS_COOKIE_HEADER.",
    statusHint: "Manual cookie or env mode is the supported Windows path in this build.",
    connectHint:
      "Open a signed-in Abacus AI compute-points usage request in DevTools, copy the full Cookie request header, paste it here, then retry. Do not paste Set-Cookie.",
    guidedCookieLogin: {
      buttonLabel: "Connect Abacus AI",
      windowTitle: "Connect Abacus AI",
      loginUrl: "https://apps.abacus.ai/chatllm/admin/compute-points-usage",
      successUrlContains: "/chatllm/admin/compute-points-usage",
      cookieUrls: ["https://apps.abacus.ai/chatllm/admin/compute-points-usage"],
      secretKey: "cookieHeader",
      successMessage: "Abacus AI session captured. No email or password was stored.",
    },
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description:
        "Paste the full Cookie header from a signed-in apps.abacus.ai request. Do not paste Set-Cookie.",
      placeholder: "sessionid=...; session_token=...;",
    },
  },
  perplexity: {
    mode: "editable",
    title: "Perplexity Setup",
    summary:
      "Fetches Perplexity credit pools from the signed-in billing session using a manual Cookie header or matching env vars.",
    statusHint: "Manual cookie or env mode is the supported Windows path in this build.",
    connectHint:
      "Open a signed-in perplexity.ai billing request in DevTools, copy the full Cookie request header, paste it here, then retry. Do not paste Set-Cookie.",
    guidedCookieLogin: {
      buttonLabel: "Connect Perplexity",
      windowTitle: "Connect Perplexity",
      loginUrl: "https://www.perplexity.ai/account/details",
      successUrlContains: "/account/details",
      cookieUrls: ["https://www.perplexity.ai/rest/billing/credits"],
      secretKey: "cookieHeader",
      successMessage: "Perplexity session captured. No email or password was stored.",
    },
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description:
        "Paste the full Cookie request header from a signed-in perplexity.ai billing request. Do not paste Set-Cookie.",
      placeholder: "__Secure-next-auth.session-token=...; pplx_session=...;",
    },
  },
  mistral: {
    mode: "editable",
    title: "Mistral Setup",
    summary:
      "Fetches current-month Mistral billing usage through the official Admin API. Existing Cookie header credentials remain a compatibility fallback.",
    statusHint: "A dedicated Mistral Admin API key is the preferred authentication path.",
    connectHint:
      "Create an Admin API key in Mistral Backoffice, save it here, then retry. Existing MISTRAL_COOKIE_HEADER and MISTRAL_SESSION values remain supported as fallbacks.",
    secretField: {
      key: "adminApiKey",
      label: "Admin API key",
      description:
        "Paste a dedicated Mistral Admin API key. UsageBar stores it in the app credential vault and sends it only to the official Admin usage endpoint.",
      placeholder: "Admin API key",
    },
  },
  grok: {
    mode: "automatic",
    title: "Grok Setup",
    summary:
      "Tracks Grok Build credit usage from the local Grok CLI login. Reads the same auth file (~/.grok/auth.json) that the Grok CLI uses.",
    statusHint: "No manual setup is required once Grok CLI is signed in.",
    connectHint: "Install Grok CLI, run `grok login`, then retry.",
  },
  "jetbrains-ai-assistant": {
    mode: "automatic",
    title: "JetBrains AI Setup",
    summary: "Detected from the local IDE environment.",
    statusHint: "This provider currently relies on auto-detection only.",
    connectHint: "Sign in through JetBrains AI Assistant in your IDE, then retry.",
  },
  zai: {
    mode: "editable",
    title: "Z.ai Setup",
    summary:
      "Fetches Z.ai GLM Coding quota data from a stored API key, ZAI_API_KEY, or GLM_API_KEY.",
    statusHint:
      "Save a Z.ai API key here, set ZAI_API_KEY, or set GLM_API_KEY before launching UsageBar.",
    connectHint:
      "Create a Z.ai API key in the console, save it here or set ZAI_API_KEY / GLM_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description:
        "Paste a Z.ai API key. UsageBar stores it in the app credential vault and uses it for the subscription and quota endpoints.",
      placeholder: "sk-...",
    },
  },
  augment: {
    mode: "editable",
    title: "Augment Setup",
    summary:
      "Detects local Auggie auth and fetches dashboard credit usage from a signed-in web session Cookie header.",
    statusHint:
      "Run `auggie login` for local auth detection. Dashboard credit usage still needs a Cookie header or AUGMENT_COOKIE_HEADER.",
    connectHint:
      "Run `auggie login` to confirm local Augment auth. For dashboard credit usage, open a signed-in app.augmentcode.com subscription or credits request in DevTools, copy the full Cookie request header, paste it here, then retry. Do not paste Set-Cookie.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description:
        "Paste the full Cookie request header from a signed-in app.augmentcode.com request. Do not paste Set-Cookie.",
      placeholder: "_session=...; authjs.session-token=...;",
    },
  },
  alibaba: {
    mode: "editable",
    title: "Alibaba Setup",
    summary:
      "Fetches Coding Plan request quotas and Bailian Token Plan credits from separate credentials.",
    statusHint:
      "Save a Coding Plan API key, a Bailian Cookie header, or both. Default Coding Plan region is cn-beijing.",
    connectHint: "Save the credential for each Alibaba plan that you use, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description:
        "Paste an Alibaba Coding Plan API key. UsageBar stores it in the app credential vault and uses it for the Coding Plan quotas endpoint.",
      placeholder: "sk-sp-...",
    },
    additionalSecretField: {
      key: "cookieHeader",
      label: "Bailian Cookie header",
      description:
        "Paste the full Cookie request header from the Bailian Token Plan subscription page. Do not paste Set-Cookie.",
      placeholder: "login_aliyunid_ticket=...; sec_token=...;",
    },
  },
  doubao: {
    mode: "editable",
    title: "Doubao Setup",
    summary: "Reads Volcengine Ark request-limit headers with a minimal one-token probe.",
    statusHint: "Save a Doubao API key or set ARK_API_KEY, VOLCENGINE_API_KEY, or DOUBAO_API_KEY.",
    connectHint: "Save a Volcengine Ark API key, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "UsageBar sends one minimal request to the Ark coding endpoint.",
      placeholder: "API key",
    },
  },
  chutes: {
    mode: "editable",
    title: "Chutes Setup",
    summary: "Fetches the four-hour and monthly quota windows from the Chutes management API.",
    statusHint: "Save a Chutes API key or set CHUTES_API_KEY.",
    connectHint: "Create a Chutes API key, save it here, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description: "UsageBar sends this key only to api.chutes.ai.",
      placeholder: "cpk_...",
    },
  },
  devin: {
    mode: "editable",
    title: "Devin Setup",
    summary: "Fetches daily and weekly quota for one explicit Devin organization.",
    statusHint: "Save a bearer token and an internal org_... organization ID.",
    connectHint:
      "Copy the bearer token and internal organization ID from an app.devin.ai quota request.",
    secretField: {
      key: "token",
      label: "Bearer token",
      description: "Paste the bare token or the complete Bearer header value.",
      placeholder: "Bearer ...",
    },
    textField: {
      key: "workspaceId",
      label: "Organization ID",
      description: "Use the internal org_... ID. UsageBar does not guess this value.",
      placeholder: "org_...",
    },
  },
  qoder: {
    mode: "editable",
    title: "Qoder Setup",
    summary: "Fetches Big Model credits from the international or China Qoder dashboard.",
    statusHint: "Save a Cookie header and set the matching Qoder host.",
    connectHint:
      "Copy the Cookie request header from the Qoder usage page and enter qoder.com or qoder.com.cn.",
    secretField: {
      key: "cookieHeader",
      label: "Cookie header",
      description: "Paste the Cookie request header. Do not paste Set-Cookie.",
      placeholder: "session=...;",
    },
    textField: {
      key: "workspaceId",
      label: "Qoder host",
      description: "Enter qoder.com or qoder.com.cn for the account region.",
      placeholder: "qoder.com",
    },
  },
  stepfun: {
    mode: "editable",
    title: "StepFun Setup",
    summary: "Fetches five-hour and weekly Step Plan quota with a manual Oasis-Token.",
    statusHint: "Save a current Oasis-Token or set STEPFUN_TOKEN.",
    connectHint: "Copy an Oasis-Token from a signed-in platform.stepfun.com request, then retry.",
    secretField: {
      key: "token",
      label: "Oasis-Token",
      description: "UsageBar stores the token in the app credential vault.",
      placeholder: "Oasis-Token",
    },
  },
  deepseek: {
    mode: "editable",
    title: "DeepSeek Setup",
    summary:
      "Fetches DeepSeek API balance from a stored API key or DEEPSEEK_API_KEY-compatible env vars.",
    statusHint: "Save a DeepSeek API key here or set DEEPSEEK_API_KEY before launching UsageBar.",
    connectHint:
      "Create a DeepSeek API key in the platform dashboard, save it here or set DEEPSEEK_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description:
        "Paste a DeepSeek API key. UsageBar stores it in the app credential vault and uses it for https://api.deepseek.com/user/balance.",
      placeholder: "sk-...",
    },
  },
  kilo: {
    mode: "editable",
    title: "Kilo Setup",
    summary:
      "Fetches Kilo usage from a stored API key or KILO_API_KEY. CLI-session fallback is still deferred in this Windows-first build.",
    statusHint: "Save a Kilo API key here or set KILO_API_KEY before launching UsageBar.",
    connectHint:
      "Create a Kilo API key at https://kilo.com, save it here or set KILO_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description:
        "Paste a Kilo API key. UsageBar stores it in the app credential vault and uses it for the Kilo tRPC usage endpoint.",
      placeholder: "kilo_...",
    },
  },
  "kimi-k2": {
    mode: "editable",
    title: "Moonshot API Balance Setup",
    summary:
      "Fetches official Kimi Open Platform API balance from Moonshot using a stored API key or MOONSHOT_API_KEY-compatible env vars. This is separate from the Kimi Code subscription provider.",
    statusHint:
      "Save a Moonshot/Kimi Open Platform API key here or set MOONSHOT_API_KEY, KIMI_API_KEY, or KIMI_KEY before launching UsageBar.",
    connectHint:
      "Use this provider for official Moonshot API billing balance only. It calls https://api.moonshot.ai/v1/users/me/balance and does not read kimi.com memberships or Kimi Code CLI quotas.",
    secretField: {
      key: "apiKey",
      label: "Moonshot API key",
      description:
        "Paste a Kimi Open Platform API key. UsageBar stores it in the app credential vault and uses it for https://api.moonshot.ai/v1/users/me/balance.",
      placeholder: "sk-...",
    },
  },
  kiro: {
    mode: "automatic",
    title: "Kiro Setup",
    summary:
      "Reads local Kiro desktop auth/cache state when present, then Kiro CLI auth for live quota, with local CLI session metering as a degraded fallback.",
    statusHint:
      "Open Kiro desktop or run Kiro CLI on this machine so UsageBar can read authenticated usage state.",
    connectHint:
      "Open Kiro or run Kiro CLI and sign in. If UsageBar cannot fetch live CLI quota, run at least one CLI prompt so degraded session metering exists.",
  },
  openrouter: {
    mode: "editable",
    title: "OpenRouter Setup",
    summary:
      "Fetches OpenRouter credits and key-rate data from a stored management key or OPENROUTER_API_KEY.",
    statusHint:
      "Save an OpenRouter management key here or set OPENROUTER_API_KEY before launching UsageBar.",
    connectHint:
      "Create a management key in the OpenRouter dashboard, save it here or set OPENROUTER_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "Management key",
      description:
        "Paste an OpenRouter management key. UsageBar stores it in the app credential vault and uses it for the credits and key endpoints.",
      placeholder: "sk-or-v1-...",
    },
  },
  synthetic: {
    mode: "editable",
    title: "Synthetic Setup",
    summary: "Fetches Synthetic quota data from a stored API key or SYNTHETIC_API_KEY.",
    statusHint: "Save a Synthetic API key here or set SYNTHETIC_API_KEY before launching UsageBar.",
    connectHint:
      "Create a Synthetic API key at https://api.synthetic.new, save it here or set SYNTHETIC_API_KEY, then retry.",
    secretField: {
      key: "apiKey",
      label: "API key",
      description:
        "Paste a Synthetic API key. UsageBar stores it in the app credential vault and uses it for the quotas endpoint.",
      placeholder: "synthetic_...",
    },
  },
  "vertex-ai": {
    mode: "automatic",
    title: "Vertex AI Setup",
    summary:
      "Detected from gcloud application-default credentials and Cloud Monitoring quota metrics.",
    statusHint:
      "Run `gcloud auth application-default login` and configure a project before launching UsageBar.",
    connectHint:
      "Run `gcloud auth application-default login`, then `gcloud config set project PROJECT_ID` or set GOOGLE_CLOUD_PROJECT, and ensure the project allows Cloud Monitoring time-series reads.",
  },
  warp: {
    mode: "editable",
    title: "Warp Setup",
    summary:
      "Fetches Warp request limits from a stored token or WARP_API_KEY-compatible env vars through an undocumented app endpoint.",
    statusHint:
      "Save a Warp token here or set WARP_API_KEY / WARP_TOKEN before launching UsageBar.",
    connectHint:
      "Create a Warp API key in Warp Settings -> Platform -> API Keys, save it here or set WARP_API_KEY, then retry.",
    secretField: {
      key: "token",
      label: "Token",
      description:
        "Paste a Warp API key. UsageBar stores it in the app credential vault and uses it for the undocumented request-limit GraphQL endpoint.",
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
  const workspaceId =
    typeof raw.workspaceId === "string" ? raw.workspaceId.trim() || undefined : undefined
  const selectedAccountProfileId =
    typeof raw.selectedAccountProfileId === "string"
      ? raw.selectedAccountProfileId.trim() || undefined
      : undefined
  const historyPath =
    typeof raw.historyPath === "string" ? raw.historyPath.trim() || undefined : undefined
  const pricingMode =
    raw.pricingMode === "calculate" || raw.pricingMode === "display" || raw.pricingMode === "auto"
      ? raw.pricingMode
      : undefined
  const offlinePricing = raw.offlinePricing === "enabled" ? "enabled" : undefined
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : undefined
  const secrets = sanitizeSecretMetadata(raw.secrets)

  return {
    source,
    workspaceId,
    selectedAccountProfileId,
    historyPath,
    pricingMode,
    offlinePricing,
    updatedAt,
    secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
  }
}

export function getProviderSettingsDefinition(providerId: string): ProviderSettingsDefinition {
  return (
    PROVIDER_SETTINGS_DEFINITIONS[providerId] ?? {
      mode: "automatic",
      title: "Provider Setup",
      summary: "This provider currently relies on local auto-detection.",
      statusHint: "Manual configuration is not available yet.",
      connectHint: "Sign in to this provider on the same machine, then retry.",
    }
  )
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

export function getProviderSourceLabel(
  providerId: string,
  config: ProviderConfig | undefined
): string {
  if (providerId === "opencode") {
    return config?.source === "manual" ? "Manual cookie" : "Automatic"
  }
  if (providerId === "ollama")
    return config?.secrets?.cookieHeader ? "Cloud auth + settings cookie" : "Cloud auth/cookie"
  if (providerId === "perplexity") return "Manual cookie"
  if (providerId === "abacus") return "Manual cookie"
  if (providerId === "mistral")
    return config?.secrets?.adminApiKey
      ? "Stored Mistral Admin API key"
      : "Mistral Admin API key/env"
  if (providerId === "augment")
    return config?.secrets?.cookieHeader ? "Auggie auth + dashboard cookie" : "Auggie auth/cookie"
  if (providerId === "deepseek")
    return config?.secrets?.apiKey ? "Stored DeepSeek API key" : "DeepSeek API key/env"
  if (providerId === "grok") return "Local Grok CLI auth"
  if (providerId === "codebuff")
    return config?.secrets?.apiKey ? "Stored Codebuff API token" : "Codebuff API token/env"
  if (providerId === "kimi")
    return config?.secrets?.apiKey ? "Kimi Code OAuth + Moonshot API key" : "Kimi Code OAuth"
  if (providerId === "kimi-k2")
    return config?.secrets?.apiKey ? "Stored Moonshot API key" : "Moonshot API key/env"
  if (providerId === "zai")
    return config?.secrets?.apiKey ? "Stored Z.ai API key" : "Z.ai API key/env"
  if (providerId === "minimax")
    return config?.secrets?.apiKey ? "Stored MiniMax API key" : "MiniMax API key/env"
  if (providerId === "amp")
    return config?.secrets?.apiKey ? "Stored Amp API key" : "Amp CLI credentials"
  if (providerId === "copilot")
    return config?.workspaceId ? "GitHub auth + billing scope" : "GitHub auth"
  if (providerId === "claude")
    return config?.secrets?.cookieHeader ? "OAuth + web cookie" : "Auto-detected"
  if (providerId === "codex") {
    if (config?.selectedAccountProfileId && config?.secrets?.cookieHeader)
      return "Managed account + dashboard cookie"
    if (config?.selectedAccountProfileId) return "Managed account"
    if (config?.secrets?.cookieHeader) return "Auto-detected + dashboard cookie"
    return "Auto-detected"
  }
  return "Auto-detected"
}
