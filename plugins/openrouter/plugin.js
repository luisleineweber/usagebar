(function () {
  const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
  const CREDITS_TIMEOUT_MS = 15000
  const KEY_TIMEOUT_MS = 1000

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

  function joinUrl(baseUrl, path) {
    const base = String(baseUrl).replace(/\/+$/, "")
    return base + path
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
        const envKey = readString(ctx.host.env.get("OPENROUTER_API_KEY"))
        if (envKey) return envKey
      } catch (e) {
        ctx.host.log.warn("env read failed for OPENROUTER_API_KEY: " + String(e))
      }
    }

    return null
  }

  function loadBaseUrl(ctx) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return DEFAULT_BASE_URL
    try {
      return readString(ctx.host.env.get("OPENROUTER_API_URL")) || DEFAULT_BASE_URL
    } catch (e) {
      ctx.host.log.warn("env read failed for OPENROUTER_API_URL: " + String(e))
      return DEFAULT_BASE_URL
    }
  }

  function requestJson(ctx, url, apiKey, timeoutMs, failureMode) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
          "X-Title": "UsageBar",
        },
        timeoutMs,
      })
    } catch (e) {
      if (failureMode === "soft") {
        ctx.host.log.warn("request failed (" + url + "): " + String(e))
        return null
      }
      ctx.host.log.error("request failed (" + url + "): " + String(e))
      throw "OpenRouter request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      if (failureMode === "soft") {
        ctx.host.log.warn("request returned auth status " + resp.status + " (" + url + ")")
        return null
      }
      throw "OpenRouter credits requires a management key. Check Setup or OPENROUTER_API_KEY."
    }

    if (resp.status < 200 || resp.status >= 300) {
      if (failureMode === "soft") {
        ctx.host.log.warn("request returned status " + resp.status + " (" + url + ")")
        return null
      }
      throw "OpenRouter request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      if (failureMode === "soft") {
        ctx.host.log.warn("request returned invalid JSON (" + url + ")")
        return null
      }
      throw "OpenRouter response invalid. Try again later."
    }

    return data
  }

  function readCredits(data) {
    const container = data && typeof data.data === "object" ? data.data : data
    if (!container || typeof container !== "object") return null

    const totalCredits = readNumber(container.total_credits ?? container.totalCredits)
    const totalUsage = readNumber(container.total_usage ?? container.totalUsage)
    if (totalCredits === null || totalUsage === null) return null

    return {
      totalCredits: Math.max(0, totalCredits),
      totalUsage: Math.max(0, totalUsage),
    }
  }

  function readKeyData(data) {
    const container = data && typeof data.data === "object" ? data.data : data
    if (!container || typeof container !== "object") return null

    const limit = readNumber(container.limit)
    const usage = readNumber(container.usage)
    const rateLimit = container.rate_limit && typeof container.rate_limit === "object"
      ? container.rate_limit
      : container.rateLimit && typeof container.rateLimit === "object"
        ? container.rateLimit
        : null

    return {
      limit,
      usage,
      rateLimit: rateLimit
        ? {
          requests: readNumber(rateLimit.requests),
          interval: readString(rateLimit.interval),
        }
        : null,
    }
  }

  function formatMoney(value) {
    return "$" + Number(value || 0).toFixed(2)
  }

  function probe(ctx) {
    const apiKey = loadApiKey(ctx)
    if (!apiKey) {
      throw "OpenRouter management key missing. Save it in Setup or set OPENROUTER_API_KEY."
    }

    const baseUrl = loadBaseUrl(ctx)
    const creditsPayload = requestJson(ctx, joinUrl(baseUrl, "/credits"), apiKey, CREDITS_TIMEOUT_MS, "hard")
    const credits = readCredits(creditsPayload)
    if (!credits) {
      throw "OpenRouter credits response missing totals. Try again later."
    }

    const keyPayload = requestJson(ctx, joinUrl(baseUrl, "/key"), apiKey, KEY_TIMEOUT_MS, "soft")
    const keyData = keyPayload ? readKeyData(keyPayload) : null

    const lines = [
      ctx.line.progress({
        label: "Credits",
        used: credits.totalUsage,
        limit: Math.max(credits.totalCredits, credits.totalUsage, 1),
        format: { kind: "dollars" },
      }),
    ]

    let requestValue = "Unavailable"
    if (keyData && keyData.rateLimit && keyData.rateLimit.requests !== null && keyData.rateLimit.interval) {
      requestValue = String(Math.round(keyData.rateLimit.requests)) + " / " + keyData.rateLimit.interval
    } else if (keyData && keyData.limit !== null && keyData.usage !== null && keyData.limit > 0) {
      requestValue = formatMoney(Math.max(0, keyData.limit - keyData.usage)) + " key credit left"
    } else if (keyPayload) {
      requestValue = "No key limit configured"
    }

    lines.push(ctx.line.text({ label: "Requests", value: requestValue }))

    return {
      plan: "Balance: " + formatMoney(Math.max(0, credits.totalCredits - credits.totalUsage)),
      lines,
    }
  }

  globalThis.__openusage_plugin = { id: "openrouter", probe }
})()
