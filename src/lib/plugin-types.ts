export type ProgressFormat =
  | { kind: "percent" }
  | { kind: "dollars" }
  | { kind: "count"; suffix: string }

export type MetricAvailability = "unknown" | "unsupported"

export type MetricLine =
  | { type: "text"; label: string; value: string; color?: string; subtitle?: string }
  | {
      type: "progress"
      label: string
      used: number | null
      limit: number | null
      format: ProgressFormat
      availability?: MetricAvailability
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

export type DetailFieldType = "text" | "badge" | "window" | "chart" | "notice"
export type DetailVisibility = "ifPresent" | "always"
export type DetailRole =
  | "account"
  | "organization"
  | "billing"
  | "quota"
  | "source"
  | "reset"
  | "authentication"

export type DetailFormat =
  | { kind: "text" }
  | { kind: "date" }
  | { kind: "dateTime" }
  | { kind: "duration" }
  | { kind: "percent" }
  | { kind: "currency"; currency: string }
  | { kind: "count"; suffix: string }

export type ManifestDetailChart = {
  kind: "sparkline"
  maxPoints: number
}

export type ManifestDetailField = {
  id: string
  label: string
  type: DetailFieldType
  visibility: DetailVisibility
  role?: DetailRole
  format?: DetailFormat
  chart?: ManifestDetailChart
}

export type ManifestDetailSection = {
  id: string
  label: string
  fields: ManifestDetailField[]
}

export type ManifestDetail = {
  sections: ManifestDetailSection[]
}

export type DetailChartPoint = {
  label: string
  value: number
}

export type PluginDetailValue =
  | { type: "text"; id: string; value: string; color?: string }
  | { type: "badge"; id: string; text: string; color?: string; subtitle?: string }
  | {
      type: "window"
      id: string
      used: number | null
      limit: number | null
      format: ProgressFormat
      availability?: MetricAvailability
      resetsAt?: string
      periodDurationMs?: number
      color?: string
    }
  | {
      type: "chart"
      id: string
      kind: "sparkline"
      points: DetailChartPoint[]
      format?: ProgressFormat
      color?: string
    }
  | { type: "notice"; id: string; text: string; tone: "info" | "warning" | "error" }

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
  details?: PluginDetailValue[]
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
  iconAspectRatio?: number
  brandColor?: string
  defaultPlan?: string
  supportState?: PluginSupportState
  supportMessage?: string | null
  isSurfaced?: boolean
  statusPageUrl?: string | null
  status?: PluginStatusSource | null
  lines: ManifestLine[]
  detail?: ManifestDetail
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
