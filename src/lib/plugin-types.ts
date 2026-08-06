export type ProgressFormat =
  | { kind: "percent" }
  | { kind: "dollars" }
  | { kind: "count"; suffix: string }

export type MetricLine =
  | { type: "text"; label: string; value: string; color?: string; subtitle?: string }
  | {
      type: "progress"
      label: string
      used: number
      limit: number
      format: ProgressFormat
      resetsAt?: string
      periodDurationMs?: number
      color?: string
    }
  | { type: "badge"; label: string; text: string; color?: string; subtitle?: string }

export type ManifestLine = {
  type: "text" | "progress" | "badge"
  label: string
  scope: "overview" | "detail"
}

export type PluginLink = {
  label: string
  url: string
}

export type PluginStatusSource = {
  kind: "statuspageV2" | "html" | "rss" | "zedSummaryV3"
  endpoint?: string | null
  componentNames?: string[]
}

export type ProbeErrorCategory =
  | "credentialMissing"
  | "credentialUnavailable"
  | "credentialUnreadable"
  | "credentialInvalid"
  | "credentialExpired"
  | "providerResponse"
  | "unknown"

export type ProviderInstanceRef = {
  providerId: string
  instanceId?: string
}

export type PluginOutput = {
  providerId: string
  instanceRef?: ProviderInstanceRef
  displayName: string
  plan?: string
  lines: MetricLine[]
  iconUrl: string
  error?: {
    category: ProbeErrorCategory
    message: string
  }
  history?: UsageHistory
  freshness?: DataFreshnessGroups
}

export type DataFreshness = {
  state: "fresh" | "retained"
  observedAt: string
}

export type DataFreshnessGroups = Partial<Record<"quota" | "cost" | "history", DataFreshness>>

export type UsageHistoryEntry = {
  periodStart: string
  periodEnd: string
  model?: string
  project?: string
  account?: string
  costUsd?: number
  requests?: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  reasoningTokens?: number
  totalTokens?: number
}

export type UsageHistory = {
  version: 1
  source: string
  timeZone: string
  entries: UsageHistoryEntry[]
}

export type UsageHistoryPoint = {
  capturedAt: number
  label: string
  used: number
  limit: number
  format: ProgressFormat
  color?: string
}

export type ProviderUsageHistory = {
  points: UsageHistoryPoint[]
}

export type PluginSupportState = "supported" | "experimental" | "comingSoonOnWindows"
export type PluginIconColorMode = "monochrome" | "multicolor"

export type PluginMeta = {
  id: string
  name: string
  iconUrl: string
  darkIconUrl?: string
  iconColorMode?: PluginIconColorMode
  brandColor?: string
  defaultPlan?: string
  supportState?: PluginSupportState
  supportMessage?: string | null
  isSurfaced?: boolean
  statusPageUrl?: string | null
  status?: PluginStatusSource | null
  lines: ManifestLine[]
  links?: PluginLink[]
  /** Ordered list of primary metric candidates. Frontend picks first available. */
  primaryCandidates: string[]
}

export type PluginDisplayState = {
  meta: PluginMeta
  data: PluginOutput | null
  lastSettledData?: PluginOutput | null
  history?: ProviderUsageHistory
  loading: boolean
  error: string | null
  lastManualRefreshAt: number | null
}
