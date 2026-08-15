import { isTauri } from "@tauri-apps/api/core"
import { LazyStore } from "@tauri-apps/plugin-store"
import type { UsageHistoryRecord } from "@/lib/usage-history"

export type ModelPriceOverride = { inputPerMillion: number; outputPerMillion: number }
export type ModelPriceOverrides = Record<string, ModelPriceOverride>

const store = new LazyStore("settings.json")
const KEY = "modelPriceOverrides"

export function normalizeModelPriceOverrides(value: unknown): ModelPriceOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const overrides: ModelPriceOverrides = {}
  for (const [model, candidate] of Object.entries(value)) {
    if (!model.trim() || !candidate || typeof candidate !== "object") continue
    const raw = candidate as Partial<ModelPriceOverride>
    const inputPerMillion = Number(raw.inputPerMillion)
    const outputPerMillion = Number(raw.outputPerMillion)
    if (
      !Number.isFinite(inputPerMillion) ||
      !Number.isFinite(outputPerMillion) ||
      inputPerMillion < 0 ||
      outputPerMillion < 0
    ) {
      continue
    }
    overrides[model.trim()] = { inputPerMillion, outputPerMillion }
  }
  return overrides
}

export async function loadModelPriceOverrides(): Promise<ModelPriceOverrides> {
  if (!isTauri()) return {}
  return normalizeModelPriceOverrides(await store.get(KEY))
}

export async function saveModelPriceOverrides(overrides: ModelPriceOverrides): Promise<void> {
  if (!isTauri()) return
  await store.set(KEY, normalizeModelPriceOverrides(overrides))
  await store.save()
}

export function reportEntryCost(
  record: UsageHistoryRecord,
  overrides: ModelPriceOverrides
): number | null {
  const override = record.model ? overrides[record.model] : undefined
  if (!override) return record.costUsd ?? null
  if (typeof record.inputTokens !== "number" || typeof record.outputTokens !== "number") {
    return record.costUsd ?? null
  }
  const input =
    (record.inputTokens ?? 0) + (record.cacheReadTokens ?? 0) + (record.cacheCreationTokens ?? 0)
  const output = (record.outputTokens ?? 0) + (record.reasoningTokens ?? 0)
  return (
    (input / 1_000_000) * override.inputPerMillion +
    (output / 1_000_000) * override.outputPerMillion
  )
}
