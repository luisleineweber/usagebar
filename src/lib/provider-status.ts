import type { PluginMeta } from "@/lib/plugin-types"

export type ProviderStatusIndicator = "none" | "minor" | "major" | "maintenance" | "unknown"

export type ProviderStatus = {
  indicator: ProviderStatusIndicator
  description: string | null
  updatedAt: number | null
  checkedAt: number
}

type StatusPageResponse = {
  status?: {
    indicator?: string
    description?: string
  }
  page?: {
    updated_at?: string
  }
}

export function hasProviderStatusIssue(status: ProviderStatus | undefined): boolean {
  if (!status) return false
  return status.indicator !== "none"
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

export async function fetchProviderStatus(plugin: Pick<PluginMeta, "statusPageUrl">): Promise<ProviderStatus | null> {
  if (!plugin.statusPageUrl) return null
  const statusUrl = normalizeStatusPageUrl(plugin.statusPageUrl)
  if (!statusUrl) return null

  const response = await fetch(statusUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Status API returned ${response.status}`)

  const body = (await response.json()) as StatusPageResponse
  const updatedAt = body.page?.updated_at ? Date.parse(body.page.updated_at) : Number.NaN
  return {
    indicator: normalizeIndicator(body.status?.indicator),
    description: body.status?.description?.trim() || null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    checkedAt: Date.now(),
  }
}
