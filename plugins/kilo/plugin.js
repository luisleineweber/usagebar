(function () {
  const BASE_URL = "https://app.kilo.ai/api/trpc"
  const PROCEDURES = [
    "user.getCreditBlocks",
    "kiloPass.getState",
    "user.getAutoTopUpPaymentMethod",
  ]

  function readString(value) {
    if (typeof value !== "string") return null
    let trimmed = value.trim()
    if (!trimmed) return null
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1).trim()
    }
    return trimmed || null
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    const text = readString(value)
    if (!text) return null
    const n = Number(text)
    return Number.isFinite(n) ? n : null
  }

  function readObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  }

  function loadApiKey(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = readString(ctx.host.providerSecrets.read("apiKey"))
        if (stored) return stored
      } catch (e) {
        ctx.host.log.warn("provider secret read failed: " + String(e))
      }
    }

    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      try {
        const envKey = readString(ctx.host.env.get("KILO_API_KEY"))
        if (envKey) return envKey
      } catch (e) {
        ctx.host.log.warn("env read failed for KILO_API_KEY: " + String(e))
      }
    }

    return null
  }

  function buildUrl() {
    const inputMap = {}
    for (let i = 0; i < PROCEDURES.length; i += 1) {
      inputMap[String(i)] = { json: null }
    }
    const url = new URL(BASE_URL.replace(/\/+$/, "") + "/" + PROCEDURES.join(","))
    url.searchParams.set("batch", "1")
    url.searchParams.set("input", JSON.stringify(inputMap))
    return url.toString()
  }

  function requestUsage(ctx, apiKey) {
    let resp
    const url = buildUrl()
    try {
      resp = ctx.util.request({
        method: "GET",
        url,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request failed (" + url + "): " + String(e))
      throw "Kilo request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Kilo API key invalid. Refresh KILO_API_KEY."
    }
    if (resp.status === 404) {
      throw "Kilo API endpoint not found. Verify the tRPC batch path."
    }
    if (resp.status >= 500 && resp.status <= 599) {
      throw "Kilo API unavailable (HTTP " + String(resp.status) + "). Try again later."
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw "Kilo request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      throw "Kilo response invalid. Try again later."
    }
    return data
  }

  function getEntryMap(payload) {
    if (Array.isArray(payload)) {
      const out = {}
      for (let i = 0; i < payload.length && i < PROCEDURES.length; i += 1) {
        const entry = readObject(payload[i])
        if (entry) out[i] = entry
      }
      return out
    }

    const objectPayload = readObject(payload)
    if (!objectPayload) return null
    if (objectPayload.result || objectPayload.error) return { 0: objectPayload }

    const indexed = {}
    for (const [key, value] of Object.entries(objectPayload)) {
      const index = Number(key)
      const entry = readObject(value)
      if (Number.isInteger(index) && index >= 0 && index < PROCEDURES.length && entry) {
        indexed[index] = entry
      }
    }
    return Object.keys(indexed).length > 0 ? indexed : null
  }

  function extractResult(entry) {
    const result = readObject(entry && entry.result)
    if (!result) return null

    const data = readObject(result.data)
    if (data) {
      if ("json" in data) return data.json === null ? null : data.json
      return data
    }

    if ("json" in result) return result.json === null ? null : result.json
    return null
  }

  function isUnauthorizedTrpc(entry) {
    const error = readObject(entry && entry.error)
    if (!error) return false

    const code = readString(error.code) ||
      readString(readObject(error.data) && readObject(error.data).code) ||
      readString(readObject(error.json) && readObject(readObject(error.json).data) && readObject(readObject(error.json).data).code)
    const message = readString(error.message) ||
      readString(readObject(error.json) && readObject(error.json).message)

    const combined = [code, message].filter(Boolean).join(" ").toLowerCase()
    return combined.includes("unauthorized") || combined.includes("forbidden")
  }

  function isNotFoundTrpc(entry) {
    const error = readObject(entry && entry.error)
    if (!error) return false

    const code = readString(error.code) ||
      readString(readObject(error.data) && readObject(error.data).code) ||
      readString(readObject(error.json) && readObject(readObject(error.json).data) && readObject(readObject(error.json).data).code)
    const message = readString(error.message) ||
      readString(readObject(error.json) && readObject(error.json).message)

    const combined = [code, message].filter(Boolean).join(" ").toLowerCase()
    return combined.includes("not_found") || combined.includes("not found")
  }

  function dictionaryContexts(value, out = []) {
    const objectValue = readObject(value)
    if (!objectValue) return out
    out.push(objectValue)
    for (const nested of Object.values(objectValue)) {
      if (Array.isArray(nested)) {
        for (let i = 0; i < nested.length; i += 1) {
          dictionaryContexts(nested[i], out)
        }
      } else if (readObject(nested)) {
        dictionaryContexts(nested, out)
      }
    }
    return out
  }

  function firstNumber(contexts, keys) {
    for (let i = 0; i < contexts.length; i += 1) {
      const context = contexts[i]
      for (let j = 0; j < keys.length; j += 1) {
        const value = readNumber(context[keys[j]])
        if (value !== null) return value
      }
    }
    return null
  }

  function firstString(contexts, keys) {
    for (let i = 0; i < contexts.length; i += 1) {
      const context = contexts[i]
      for (let j = 0; j < keys.length; j += 1) {
        const value = readString(context[keys[j]])
        if (value) return value
      }
    }
    return null
  }

  function firstDateIso(ctx, contexts, keys) {
    for (let i = 0; i < contexts.length; i += 1) {
      const context = contexts[i]
      for (let j = 0; j < keys.length; j += 1) {
        const value = ctx.util.toIso(context[keys[j]])
        if (value) return value
      }
    }
    return null
  }

  function parseCredits(payload) {
    const contexts = dictionaryContexts(payload)
    let total = null
    let remaining = null

    const creditBlocks = Array.isArray(readObject(payload) && readObject(payload).creditBlocks)
      ? readObject(payload).creditBlocks
      : null
    if (creditBlocks) {
      let totalMicro = 0
      let remainingMicro = 0
      let sawTotal = false
      let sawRemaining = false
      for (let i = 0; i < creditBlocks.length; i += 1) {
        const block = readObject(creditBlocks[i])
        if (!block) continue
        const amount = readNumber(block.amount_mUsd)
        const balance = readNumber(block.balance_mUsd)
        if (amount !== null) {
          totalMicro += amount
          sawTotal = true
        }
        if (balance !== null) {
          remainingMicro += balance
          sawRemaining = true
        }
      }
      if (sawTotal) total = Math.max(0, totalMicro / 1000000)
      if (sawRemaining) remaining = Math.max(0, remainingMicro / 1000000)
    }

    if (total === null) {
      total = firstNumber(contexts, ["total", "totalCredits", "creditsTotal", "limit", "total_mUsd"])
      if (total !== null && firstString(contexts, ["total_mUsd"])) total = total / 1000000
    }
    if (remaining === null) {
      remaining = firstNumber(contexts, ["remaining", "remainingCredits", "creditsRemaining", "balance", "balance_mUsd"])
      if (remaining !== null && firstString(contexts, ["balance_mUsd"])) remaining = remaining / 1000000
    }
    let used = firstNumber(contexts, ["used", "usedCredits", "creditsUsed", "spent", "consumed", "used_mUsd"])
    if (used !== null && firstString(contexts, ["used_mUsd"])) used = used / 1000000

    if (total === null && used !== null && remaining !== null) total = used + remaining
    if (used === null && total !== null && remaining !== null) used = Math.max(0, total - remaining)
    if (remaining === null && total !== null && used !== null) remaining = Math.max(0, total - used)

    if (used === null && total === null && remaining === null) return null
    return {
      used: Math.max(0, used ?? 0),
      total: Math.max(total ?? used ?? 0, used ?? 0, 0),
      remaining: Math.max(0, remaining ?? 0),
    }
  }

  function parsePass(ctx, payload) {
    const contexts = dictionaryContexts(payload)
    const total = firstNumber(contexts, [
      "currentPeriodBaseCreditsUsd",
      "total",
      "limit",
      "planAmount",
      "creditsTotal",
    ])
    const bonus = Math.max(0, firstNumber(contexts, [
      "currentPeriodBonusCreditsUsd",
      "bonus",
      "bonusCredits",
    ]) ?? 0)
    let used = firstNumber(contexts, [
      "currentPeriodUsageUsd",
      "used",
      "spent",
      "consumed",
      "creditsUsed",
    ])
    let totalWithBonus = total
    if (totalWithBonus !== null) totalWithBonus += bonus
    let remaining = firstNumber(contexts, [
      "remaining",
      "available",
      "left",
      "balance",
      "creditsRemaining",
    ])

    if (totalWithBonus === null && used !== null && remaining !== null) totalWithBonus = used + remaining
    if (used === null && totalWithBonus !== null && remaining !== null) used = Math.max(0, totalWithBonus - remaining)
    if (remaining === null && totalWithBonus !== null && used !== null) remaining = Math.max(0, totalWithBonus - used)

    const planName = firstString(contexts, [
      "planName",
      "tier",
      "tierName",
      "passName",
      "subscriptionName",
      "name",
      "state",
    ])
    const resetsAt = firstDateIso(ctx, contexts, [
      "nextBillingAt",
      "nextRenewalAt",
      "renewsAt",
      "renewAt",
      "resetAt",
      "resetsAt",
    ])

    if (used === null && totalWithBonus === null && remaining === null && !planName && !resetsAt) return null
    return {
      used: Math.max(0, used ?? 0),
      total: Math.max(totalWithBonus ?? used ?? 0, used ?? 0, 0),
      remaining: Math.max(0, remaining ?? 0),
      planName,
      resetsAt,
    }
  }

  function selectPrimary(passInfo, creditInfo) {
    if (passInfo && passInfo.total > 0) {
      return {
        label: "Credits",
        used: passInfo.used,
        total: passInfo.total,
        resetsAt: passInfo.resetsAt,
      }
    }
    if (creditInfo && creditInfo.total > 0) {
      return {
        label: "Credits",
        used: creditInfo.used,
        total: creditInfo.total,
        resetsAt: null,
      }
    }
    return null
  }

  function probe(ctx) {
    const apiKey = loadApiKey(ctx)
    if (!apiKey) {
      throw "Kilo API key missing. Save it in Setup or set KILO_API_KEY."
    }

    const payload = requestUsage(ctx, apiKey)
    const entries = getEntryMap(payload)
    if (!entries) {
      throw "Kilo response invalid. Try again later."
    }

    if (isUnauthorizedTrpc(entries[0]) || isUnauthorizedTrpc(entries[1])) {
      throw "Kilo API key invalid. Refresh KILO_API_KEY."
    }
    if (isNotFoundTrpc(entries[0]) || isNotFoundTrpc(entries[1])) {
      throw "Kilo API endpoint not found. Verify the tRPC batch path."
    }

    const creditInfo = parseCredits(extractResult(entries[0]))
    const passInfo = parsePass(ctx, extractResult(entries[1]))
    const primary = selectPrimary(passInfo, creditInfo)
    if (!primary) {
      throw "Kilo response missing usage data. Try again later."
    }

    const planName = (passInfo && passInfo.planName) || "Kilo Pass"
    const progress = {
      label: primary.label,
      used: primary.used,
      limit: Math.max(primary.total, primary.used, 1),
      format: { kind: "dollars" },
    }
    if (primary.resetsAt) progress.resetsAt = primary.resetsAt

    return {
      plan: planName,
      lines: [
        ctx.line.progress(progress),
        ctx.line.badge({ label: "Plan", text: planName }),
      ],
    }
  }

  globalThis.__openusage_plugin = { id: "kilo", probe }
})()
