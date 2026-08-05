import type { MetricLine, PluginOutput, ProviderInstanceRef } from "@/lib/plugin-types"
import { sameProviderInstance } from "@/lib/provider-instance"
import type { ProviderStatus } from "@/lib/provider-status"

export type UsageEventType = "quota" | "incident" | "incidentResolved" | "reset"

export type UsageEvent = {
  id: string
  type: UsageEventType
  providerId: string
  instanceRef?: ProviderInstanceRef
  title: string
  body: string
  createdAt: number
}

export type NotificationPreferences = {
  enabled: boolean
  quotaThresholds: number[]
  incidents: boolean
  resets: boolean
  quietHours: { enabled: boolean; start: string; end: string }
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  quotaThresholds: [75, 90],
  incidents: true,
  resets: true,
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
}

type OutputMap = Record<string, PluginOutput | undefined>
type StatusMap = Record<string, ProviderStatus | undefined>

type ProgressLine = Extract<MetricLine, { type: "progress" }>

function progressLines(output: PluginOutput | undefined): ProgressLine[] {
  return (
    output?.lines.filter(
      (line): line is ProgressLine => line.type === "progress" && line.limit > 0
    ) ?? []
  )
}

function eventPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
}

function eventIdentity(providerId: string, output: PluginOutput | undefined): string {
  const instanceId = output?.instanceRef?.instanceId
  return instanceId ? `${providerId}:${eventPart(instanceId)}` : providerId
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object") return DEFAULT_NOTIFICATION_PREFERENCES
  const raw = value as Partial<NotificationPreferences>
  const quiet = raw.quietHours
  const thresholds = Array.isArray(raw.quotaThresholds)
    ? [
        ...new Set(
          raw.quotaThresholds.filter((item) => Number.isFinite(item) && item > 0 && item < 100)
        ),
      ].sort((a, b) => a - b)
    : DEFAULT_NOTIFICATION_PREFERENCES.quotaThresholds
  return {
    enabled: raw.enabled === true,
    quotaThresholds: thresholds,
    incidents: raw.incidents !== false,
    resets: raw.resets !== false,
    quietHours: {
      enabled: quiet?.enabled === true,
      start: /^\d{2}:\d{2}$/u.test(quiet?.start ?? "") ? quiet!.start : "22:00",
      end: /^\d{2}:\d{2}$/u.test(quiet?.end ?? "") ? quiet!.end : "08:00",
    },
  }
}

export function isQuietHours(preferences: NotificationPreferences, now = new Date()): boolean {
  if (!preferences.quietHours.enabled) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  const parse = (value: string) => {
    const [hours, minute] = value.split(":").map(Number)
    return hours * 60 + minute
  }
  const start = parse(preferences.quietHours.start)
  const end = parse(preferences.quietHours.end)
  if (start === end) return true
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

export function deriveUsageEvents({
  previousOutputs,
  outputs,
  previousStatuses,
  statuses,
  preferences,
  now = Date.now(),
}: {
  previousOutputs: OutputMap
  outputs: OutputMap
  previousStatuses: StatusMap
  statuses: StatusMap
  preferences: NotificationPreferences
  now?: number
}): UsageEvent[] {
  const events: UsageEvent[] = []

  for (const [providerId, output] of Object.entries(outputs)) {
    const previous = previousOutputs[providerId]
    if (!output || !previous) continue
    if (!sameProviderInstance(output.instanceRef, previous.instanceRef)) continue
    const previousByLabel = new Map(progressLines(previous).map((line) => [line.label, line]))
    for (const line of progressLines(output)) {
      const oldLine = previousByLabel.get(line.label)
      if (!oldLine || oldLine.limit <= 0) continue
      const before = (oldLine.used / oldLine.limit) * 100
      const current = (line.used / line.limit) * 100
      for (const threshold of preferences.quotaThresholds) {
        if (before < threshold && current >= threshold) {
          events.push({
            id: `quota:${eventIdentity(providerId, output)}:${eventPart(line.label)}:${threshold}:${line.resetsAt ?? "none"}`,
            type: "quota",
            providerId,
            ...(output.instanceRef ? { instanceRef: output.instanceRef } : {}),
            title: `${output.displayName} quota warning`,
            body: `${line.label} reached ${Math.round(current)}% used (threshold ${threshold}%).`,
            createdAt: now,
          })
        }
      }
      const resetAdvanced =
        oldLine.resetsAt &&
        line.resetsAt &&
        Date.parse(line.resetsAt) > Date.parse(oldLine.resetsAt)
      if (preferences.resets && current + 5 < before && resetAdvanced) {
        events.push({
          id: `reset:${eventIdentity(providerId, output)}:${eventPart(line.label)}:${line.resetsAt}`,
          type: "reset",
          providerId,
          ...(output.instanceRef ? { instanceRef: output.instanceRef } : {}),
          title: `${output.displayName} quota reset`,
          body: `${line.label} is available again.`,
          createdAt: now,
        })
      }
    }
  }

  if (preferences.incidents) {
    for (const [providerId, status] of Object.entries(statuses)) {
      if (!status) continue
      const previous = previousStatuses[providerId]
      const displayName = outputs[providerId]?.displayName ?? providerId
      const hasIssue = status.indicator !== "none"
      const hadIssue = previous ? previous.indicator !== "none" : false
      if (hasIssue && (!previous || !hadIssue || previous.indicator !== status.indicator)) {
        const output = outputs[providerId]
        events.push({
          id: `incident:${eventIdentity(providerId, output)}:${status.indicator}:${status.updatedAt ?? status.checkedAt}`,
          type: "incident",
          providerId,
          ...(output?.instanceRef ? { instanceRef: output.instanceRef } : {}),
          title: `${displayName} service incident`,
          body: status.description?.trim() || `${status.indicator} provider status`,
          createdAt: now,
        })
      } else if (!hasIssue && hadIssue) {
        const output = outputs[providerId]
        events.push({
          id: `resolved:${eventIdentity(providerId, output)}:${status.updatedAt ?? status.checkedAt}`,
          type: "incidentResolved",
          providerId,
          ...(output?.instanceRef ? { instanceRef: output.instanceRef } : {}),
          title: `${displayName} incident resolved`,
          body: "Provider status returned to normal.",
          createdAt: now,
        })
      }
    }
  }

  return events
}
