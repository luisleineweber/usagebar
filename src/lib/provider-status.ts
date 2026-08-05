import type { PluginMeta, PluginStatusSource } from "@/lib/plugin-types"

export type ProviderStatusIndicator = "none" | "minor" | "major" | "maintenance" | "unknown"

export type ProviderStatus = {
  indicator: ProviderStatusIndicator
  description: string | null
  updatedAt: number | null
  checkedAt: number
}

type StatusPageComponent = {
  name?: string
  status?: string
  description?: string | null
}

type StatusPageResponse = {
  status?: {
    indicator?: string
    description?: string
  }
  page?: {
    updated_at?: string
  }
  components?: StatusPageComponent[]
}

type ZedSummaryResponse = {
  page?: {
    status?: string
  }
}

export function hasProviderStatusIssue(status: ProviderStatus | undefined): boolean {
  if (!status) return false
  return (
    status.indicator === "minor" ||
    status.indicator === "major" ||
    status.indicator === "maintenance"
  )
}

export function providerStatusLabel(status: ProviderStatus | undefined): string | null {
  if (!status || status.indicator === "none") return null
  if (status.description?.trim()) return status.description.trim()
  if (status.indicator === "maintenance") return "Maintenance in progress"
  if (status.indicator === "major") return "Major incident"
  if (status.indicator === "minor") return "Minor incident"
  return "Status unknown"
}

export function normalizeStatusPageUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
    parsed.pathname = parsed.pathname.replace(/\/$/, "") + "/api/v2/status.json"
    parsed.search = ""
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeIndicator(value: string | undefined): ProviderStatusIndicator {
  if (value === "none" || value === "minor" || value === "major" || value === "maintenance") {
    return value
  }
  return "unknown"
}

function normalizeComponentIndicator(value: string | undefined): ProviderStatusIndicator {
  const normalized = value?.toLowerCase().replace(/\s+/g, "_")
  if (!normalized || normalized === "operational" || normalized === "none" || normalized === "up") {
    return "none"
  }
  if (normalized.includes("maintenance") || normalized === "under_maintenance") return "maintenance"
  if (normalized.includes("major") || normalized.includes("outage") || normalized === "down")
    return "major"
  if (
    normalized.includes("minor") ||
    normalized.includes("degraded") ||
    normalized.includes("partial")
  ) {
    return "minor"
  }
  return "unknown"
}

function statusSeverity(indicator: ProviderStatusIndicator): number {
  return { none: 0, unknown: 1, maintenance: 2, minor: 3, major: 4 }[indicator]
}

function parseUpdatedAt(value: string | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function statusFromStatusPage(
  body: StatusPageResponse,
  componentNames: string[],
  checkedAt: number
): ProviderStatus {
  const updatedAt = parseUpdatedAt(body.page?.updated_at)
  if (componentNames.length === 0) {
    return {
      indicator: normalizeIndicator(body.status?.indicator),
      description: body.status?.description?.trim() || null,
      updatedAt,
      checkedAt,
    }
  }

  const wanted = new Set(componentNames.map((name) => name.trim().toLowerCase()).filter(Boolean))
  const components = (body.components ?? []).filter((component) =>
    wanted.has(component.name?.trim().toLowerCase() ?? "")
  )
  if (components.length === 0) {
    return {
      indicator: "unknown",
      description: "Status components unavailable",
      updatedAt,
      checkedAt,
    }
  }

  const componentStatuses = components.map((component) => ({
    component,
    indicator: normalizeComponentIndicator(component.status),
  }))
  const affected = componentStatuses
    .filter(({ indicator }) => indicator !== "none")
    .sort((a, b) => statusSeverity(b.indicator) - statusSeverity(a.indicator))[0]

  if (!affected) return { indicator: "none", description: null, updatedAt, checkedAt }
  const name = affected.component.name?.trim() || "Provider service"
  const detail = affected.component.description?.trim()
  return {
    indicator: affected.indicator,
    description: detail ? `${name}: ${detail}` : `${name}: ${affected.indicator}`,
    updatedAt,
    checkedAt,
  }
}

function statusFromHtml(html: string, checkedAt: number): ProviderStatus {
  const document = new DOMParser().parseFromString(html, "text/html")
  const heading = document.querySelector("h1, h2")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
  const text = `${heading} ${document.body.textContent ?? ""}`.replace(/\s+/g, " ").trim()
  const lower = text.toLowerCase()

  if (lower.includes("all systems operational") || lower.includes("all system operational")) {
    return { indicator: "none", description: null, updatedAt: null, checkedAt }
  }
  if (lower.includes("no broad severe incidents")) {
    return { indicator: "none", description: null, updatedAt: null, checkedAt }
  }
  if (lower.includes("maintenance")) {
    return {
      indicator: "maintenance",
      description: heading || "Maintenance in progress",
      updatedAt: null,
      checkedAt,
    }
  }
  if (
    lower.includes("major outage") ||
    lower.includes("service outage") ||
    lower.includes("unavailable")
  ) {
    return {
      indicator: "major",
      description: heading || "Major incident",
      updatedAt: null,
      checkedAt,
    }
  }
  if (
    lower.includes("degraded") ||
    lower.includes("disrupted") ||
    lower.includes("partial outage")
  ) {
    return {
      indicator: "minor",
      description: heading || "Minor incident",
      updatedAt: null,
      checkedAt,
    }
  }
  return { indicator: "unknown", description: heading || null, updatedAt: null, checkedAt }
}

function stripXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function xmlTag(item: string, tag: string): string | null {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
  return match ? stripXml(match[1]) : null
}

function statusFromRss(xml: string, checkedAt: number): ProviderStatus {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
  const active = items.find((item) => {
    const description = xmlTag(item, "description")?.toLowerCase() ?? ""
    const categories = [...item.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((match) =>
      stripXml(match[1]).toLowerCase()
    )
    return (
      !/(resolved|completed)\b/.test(description) &&
      !categories.some((category) => /^(resolved|completed)$/.test(category))
    )
  })

  if (!active) return { indicator: "none", description: null, updatedAt: null, checkedAt }
  const title = xmlTag(active, "title") || "xAI incident"
  const detail = xmlTag(active, "description") || title
  const lower = `${title} ${detail}`.toLowerCase()
  const indicator = lower.includes("maintenance")
    ? "maintenance"
    : lower.includes("outage") || lower.includes("unavailable") || lower.includes("down")
      ? "major"
      : "minor"
  return {
    indicator,
    description: title,
    updatedAt: parseUpdatedAt(xmlTag(active, "pubDate") ?? undefined),
    checkedAt,
  }
}

function statusFromZed(body: ZedSummaryResponse, checkedAt: number): ProviderStatus {
  const value = body.page?.status?.toLowerCase()
  const indicator =
    value === "up"
      ? "none"
      : value === "maintenance"
        ? "maintenance"
        : value === "down"
          ? "major"
          : value === "degraded"
            ? "minor"
            : "unknown"
  return {
    indicator,
    description:
      indicator === "none" ? null : body.page?.status ? `Zed: ${body.page.status}` : null,
    updatedAt: null,
    checkedAt,
  }
}

function sourceEndpoint(
  plugin: Pick<PluginMeta, "statusPageUrl" | "status">,
  source: PluginStatusSource
): string | null {
  if (source.endpoint) return source.endpoint
  if (source.kind === "statuspageV2")
    return plugin.statusPageUrl ? normalizeStatusPageUrl(plugin.statusPageUrl) : null
  return plugin.statusPageUrl || null
}

export async function fetchProviderStatus(
  plugin: Pick<PluginMeta, "statusPageUrl" | "status">
): Promise<ProviderStatus | null> {
  if (!plugin.statusPageUrl && !plugin.status?.endpoint) return null
  const source: PluginStatusSource = plugin.status ?? { kind: "statuspageV2" }
  const statusUrl = sourceEndpoint(plugin, source)
  if (!statusUrl) return null
  const checkedAt = Date.now()
  const isJson = source.kind === "statuspageV2" || source.kind === "zedSummaryV3"
  const response = await fetch(statusUrl, {
    headers: {
      accept: isJson
        ? "application/json"
        : source.kind === "rss"
          ? "application/rss+xml, application/xml"
          : "text/html",
    },
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Status API returned ${response.status}`)

  if (source.kind === "statuspageV2") {
    const body = (await response.json()) as StatusPageResponse
    return statusFromStatusPage(body, source.componentNames ?? [], checkedAt)
  }
  if (source.kind === "zedSummaryV3")
    return statusFromZed((await response.json()) as ZedSummaryResponse, checkedAt)
  if (source.kind === "rss") return statusFromRss(await response.text(), checkedAt)
  return statusFromHtml(await response.text(), checkedAt)
}
