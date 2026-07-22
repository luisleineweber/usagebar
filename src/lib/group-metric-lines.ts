import type { MetricLine } from "@/lib/plugin-types"

export type MetricSection = {
  label: "Quota" | "Account & plan" | "Details"
  lines: MetricLine[]
}

const ACCOUNT_LABEL = /account|plan|source|auth|endpoint|project|organization|workspace/i

/**
 * Gives provider output a stable scan order without requiring every plugin to
 * carry its own presentation schema. Quotas lead, account provenance follows,
 * and provider-specific values remain available as details.
 */
export function groupMetricLines(lines: MetricLine[]): MetricSection[] {
  const quota: MetricLine[] = []
  const account: MetricLine[] = []
  const details: MetricLine[] = []

  for (const line of lines) {
    if (line.type === "progress") quota.push(line)
    else if (ACCOUNT_LABEL.test(line.label)) account.push(line)
    else details.push(line)
  }

  const sections: MetricSection[] = [
    { label: "Quota", lines: quota },
    { label: "Account & plan", lines: account },
    { label: "Details", lines: details },
  ]

  return sections.filter((section) => section.lines.length > 0)
}
