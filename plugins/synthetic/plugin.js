(function () {
  const QUOTAS_URL = "https://api.synthetic.new/v2/quotas"

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

  function readInt(value) {
    const n = readNumber(value)
    if (n === null) return null
    return Math.round(n)
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
        const envKey = readString(ctx.host.env.get("SYNTHETIC_API_KEY"))
        if (envKey) return envKey
      } catch (e) {
        ctx.host.log.warn("env read failed for SYNTHETIC_API_KEY: " + String(e))
      }
    }

    return null
  }

  function requestQuotas(ctx, apiKey) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: QUOTAS_URL,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request failed (" + QUOTAS_URL + "): " + String(e))
      throw "Synthetic request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Synthetic API key invalid. Check Setup or SYNTHETIC_API_KEY."
    }

    if (resp.status < 200 || resp.status >= 300) {
      throw "Synthetic request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      throw "Synthetic response invalid. Try again later."
    }

    return data
  }

  function firstString(payload, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const value = readString(payload[keys[i]])
      if (value) return value
    }
    return null
  }

  function firstNumber(payload, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const value = readNumber(payload[keys[i]])
      if (value !== null) return value
    }
    return null
  }

  function firstDateIso(ctx, payload, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const value = ctx.util.toIso(payload[keys[i]])
      if (value) return value
    }
    return null
  }

  function readQuotaObjects(payload) {
    const root = readObject(payload) || {}
    const data = readObject(root.data)
    const candidates = [
      root.quotas,
      root.quota,
      root.limits,
      root.usage,
      root.entries,
      root.subscription,
      data && data.quotas,
      data && data.quota,
      data && data.limits,
      data && data.usage,
      data && data.entries,
      data && data.subscription,
    ]

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i]
      if (Array.isArray(candidate)) {
        const entries = candidate.filter((item) => readObject(item))
        if (entries.length > 0) return entries
      }
      const objectValue = readObject(candidate)
      if (objectValue && isQuotaPayload(objectValue)) return [objectValue]
    }

    return []
  }

  function isQuotaPayload(payload) {
    const keyGroups = [
      ["percentUsed", "usedPercent", "usagePercent", "usage_percent", "used_percent", "percent_used", "percent"],
      ["percentRemaining", "remainingPercent", "remaining_percent", "percent_remaining"],
      ["limit", "quota", "max", "total", "capacity", "allowance"],
      ["used", "usage", "requests", "requestCount", "request_count", "consumed", "spent"],
      ["remaining", "left", "available", "balance"],
    ]

    for (let i = 0; i < keyGroups.length; i += 1) {
      if (firstNumber(payload, keyGroups[i]) !== null) return true
    }
    return false
  }

  function parsePlanName(payload) {
    const root = readObject(payload) || {}
    const data = readObject(root.data)
    return firstString(root, ["plan", "planName", "plan_name", "subscriptionPlan", "tier", "package", "packageName"]) ||
      (data && firstString(data, ["plan", "planName", "plan_name", "subscriptionPlan", "tier", "package", "packageName"])) ||
      null
  }

  function normalizePercent(value) {
    if (value === null) return null
    return value <= 1 ? value * 100 : value
  }

  function parseWindowMinutes(payload) {
    const minutes = firstNumber(payload, ["windowMinutes", "window_minutes", "periodMinutes", "period_minutes"])
    if (minutes !== null) return readInt(minutes)

    const hours = firstNumber(payload, ["windowHours", "window_hours", "periodHours", "period_hours"])
    if (hours !== null) return readInt(hours * 60)

    const days = firstNumber(payload, ["windowDays", "window_days", "periodDays", "period_days"])
    if (days !== null) return readInt(days * 24 * 60)

    const seconds = firstNumber(payload, ["windowSeconds", "window_seconds", "periodSeconds", "period_seconds"])
    if (seconds !== null) return readInt(seconds / 60)

    return null
  }

  function parseQuota(ctx, payload) {
    const usedPercentDirect = normalizePercent(firstNumber(payload, [
      "percentUsed",
      "usedPercent",
      "usagePercent",
      "usage_percent",
      "used_percent",
      "percent_used",
      "percent",
    ]))
    const remainingPercentDirect = normalizePercent(firstNumber(payload, [
      "percentRemaining",
      "remainingPercent",
      "remaining_percent",
      "percent_remaining",
    ]))

    let usedPercent = usedPercentDirect
    if (usedPercent === null && remainingPercentDirect !== null) {
      usedPercent = 100 - remainingPercentDirect
    }

    let limit = firstNumber(payload, ["limit", "quota", "max", "total", "capacity", "allowance"])
    let used = firstNumber(payload, ["used", "usage", "requests", "requestCount", "request_count", "consumed", "spent"])
    let remaining = firstNumber(payload, ["remaining", "left", "available", "balance"])

    if (usedPercent === null) {
      if (limit === null && used !== null && remaining !== null) limit = used + remaining
      if (used === null && limit !== null && remaining !== null) used = limit - remaining
      if (remaining === null && limit !== null && used !== null) remaining = Math.max(0, limit - used)
      if (limit !== null && used !== null && limit > 0) {
        usedPercent = (used / limit) * 100
      }
    }

    if (usedPercent === null) return null

    const usedValue = used !== null ? Math.max(0, used) : Math.max(0, usedPercent)
    const limitValue = limit !== null && limit > 0
      ? Math.max(limit, usedValue)
      : Math.max(100, usedValue, Math.max(0, usedPercent))

    return {
      label: firstString(payload, ["name", "label", "type", "period", "scope", "title", "id"]),
      used: usedValue,
      limit: limitValue,
      usedPercent: Math.max(0, Math.min(usedPercent, 100)),
      resetsAt: firstDateIso(ctx, payload, [
        "resetAt",
        "reset_at",
        "resetsAt",
        "resets_at",
        "renewAt",
        "renew_at",
        "renewsAt",
        "renews_at",
        "periodEnd",
        "period_end",
        "expiresAt",
        "expires_at",
        "endAt",
        "end_at",
      ]),
      windowMinutes: parseWindowMinutes(payload),
    }
  }

  function parseQuotas(ctx, payload) {
    const quotaObjects = readQuotaObjects(payload)
    const quotas = []
    for (let i = 0; i < quotaObjects.length; i += 1) {
      const parsed = parseQuota(ctx, quotaObjects[i])
      if (parsed) quotas.push(parsed)
    }
    return quotas
  }

  function formatPlan(planName, quota) {
    if (planName) return planName
    if (quota && quota.label) return quota.label
    return "Quota"
  }

  function probe(ctx) {
    const apiKey = loadApiKey(ctx)
    if (!apiKey) {
      throw "Synthetic API key missing. Save it in Setup or set SYNTHETIC_API_KEY."
    }

    const payload = requestQuotas(ctx, apiKey)
    const quotas = parseQuotas(ctx, payload)
    if (quotas.length === 0) {
      throw "Synthetic quota response missing usage data. Try again later."
    }

    const primary = quotas[0]
    const progress = {
      label: "Credits",
      used: primary.used,
      limit: Math.max(primary.limit, primary.used, 1),
      format: { kind: "percent" },
    }
    if (primary.resetsAt) {
      progress.resetsAt = primary.resetsAt
    } else if (primary.windowMinutes && primary.windowMinutes > 0) {
      progress.periodDurationMs = primary.windowMinutes * 60 * 1000
    }

    return {
      plan: formatPlan(parsePlanName(payload), primary),
      lines: [
        ctx.line.progress(progress),
        ctx.line.badge({
          label: "Tier",
          text: formatPlan(parsePlanName(payload), primary),
        }),
      ],
    }
  }

  globalThis.__openusage_plugin = { id: "synthetic", probe }
})()
