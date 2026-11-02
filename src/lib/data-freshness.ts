/**
 * Footer data freshness for the displayed providers.
 *
 * - `never`: no displayed provider has a successful update and none failed.
 * - `fresh`: the latest results have no failures; `lastSuccessAt` is the oldest success.
 * - `failed`: one or more displayed providers have an error. `lastSuccessAt` is the
 *   oldest success among the providers that did not fail, or null.
 */
export type DataFreshness =
  | { kind: "never" }
  | { kind: "fresh"; lastSuccessAt: number }
  | { kind: "failed"; failedCount: number; totalCount: number; lastSuccessAt: number | null }

type FreshnessSource = { error: string | null; lastSuccessAt?: number | null }

export function summarizeDataFreshness(plugins: FreshnessSource[]): DataFreshness {
  const failedCount = plugins.filter((plugin) => plugin.error).length
  const lastSuccessAt = plugins.reduce<number | null>((oldest, plugin) => {
    if (plugin.error || plugin.lastSuccessAt == null) return oldest
    return oldest == null ? plugin.lastSuccessAt : Math.min(oldest, plugin.lastSuccessAt)
  }, null)

  if (failedCount > 0) {
    return { kind: "failed", failedCount, totalCount: plugins.length, lastSuccessAt }
  }
  return lastSuccessAt == null ? { kind: "never" } : { kind: "fresh", lastSuccessAt }
}
