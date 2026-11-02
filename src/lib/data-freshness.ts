/**
 * Footer data freshness for the displayed providers.
 *
 * - `failed`: one or more displayed providers that are not loading have an error.
 *   `lastSuccessAt` is the oldest success among settled providers without an error, or null.
 * - `refreshing`: no settled provider failed, but one or more providers are still loading.
 *   A loading provider has no result yet, so it can never count as fresh.
 * - `never`: no displayed provider has a successful update and none failed or is loading.
 * - `fresh`: all displayed providers are settled without errors; `lastSuccessAt` is the oldest success.
 */
export type DataFreshness =
  | { kind: "never" }
  | { kind: "refreshing" }
  | { kind: "fresh"; lastSuccessAt: number }
  | { kind: "failed"; failedCount: number; totalCount: number; lastSuccessAt: number | null }

type FreshnessSource = { loading: boolean; error: string | null; lastSuccessAt?: number | null }

export function summarizeDataFreshness(plugins: FreshnessSource[]): DataFreshness {
  const settled = plugins.filter((plugin) => !plugin.loading)
  const failedCount = settled.filter((plugin) => plugin.error).length
  const lastSuccessAt = settled.reduce<number | null>((oldest, plugin) => {
    if (plugin.error || plugin.lastSuccessAt == null) return oldest
    return oldest == null ? plugin.lastSuccessAt : Math.min(oldest, plugin.lastSuccessAt)
  }, null)

  if (failedCount > 0) {
    return { kind: "failed", failedCount, totalCount: plugins.length, lastSuccessAt }
  }
  if (settled.length < plugins.length) return { kind: "refreshing" }
  return lastSuccessAt == null ? { kind: "never" } : { kind: "fresh", lastSuccessAt }
}
