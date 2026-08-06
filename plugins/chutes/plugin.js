;(function () {
  const BASE = "https://api.chutes.ai/users/me"

  function string(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  function number(value) {
    const result = typeof value === "number" ? value : Number(value)
    return Number.isFinite(result) ? result : null
  }
  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  }
  function keyValue(root, keys) {
    if (!root) return null
    for (const key of keys) if (root[key] !== undefined && root[key] !== null) return root[key]
    return null
  }
  function loadKey(ctx) {
    try {
      const value = string(ctx.host.providerSecrets.read("apiKey"))
      if (value) return { value, source: "Stored API key" }
    } catch (_) {
      // A missing stored key is an expected setup state.
    }
    try {
      const value = string(ctx.host.env.get("CHUTES_API_KEY"))
      if (value) return { value, source: "CHUTES_API_KEY" }
    } catch (_) {
      // A missing environment key is an expected setup state.
    }
    return null
  }
  function request(ctx, key, path, required) {
    let response
    try {
      response = ctx.host.http.request({
        method: "GET",
        url: BASE + path,
        headers: { Authorization: "Bearer " + key, Accept: "application/json" },
        timeoutMs: 15000,
      })
    } catch (_) {
      if (required) throw "Chutes request failed. Check your connection."
      return null
    }
    if (response.status === 401 || response.status === 403)
      throw "Chutes API key invalid. Check Setup."
    if (response.status < 200 || response.status >= 300) {
      if (required) throw "Chutes request failed (HTTP " + response.status + "). Try again later."
      return null
    }
    const data = ctx.util.tryParseJson(response.bodyText)
    if (!data && required) throw "Chutes response invalid. Try again later."
    return data
  }
  function quota(payload) {
    const value = object(payload)
    if (!value) return null
    const used = number(keyValue(value, ["used", "usage", "consumed", "current", "monthly_usage"]))
    const remaining = number(keyValue(value, ["remaining", "available", "balance", "left"]))
    let limit = number(keyValue(value, ["limit", "quota", "total", "max", "maximum"]))
    let actualUsed = used
    if (limit === null && used !== null && remaining !== null) limit = used + remaining
    if (actualUsed === null && limit !== null && remaining !== null)
      actualUsed = Math.max(0, limit - remaining)
    const percentUsed = number(
      keyValue(value, ["percent_used", "usage_percent", "used_percent", "utilization"])
    )
    if ((actualUsed === null || limit === null || limit <= 0) && percentUsed !== null) {
      return {
        used: Math.max(
          0,
          Math.min(100, Math.abs(percentUsed) <= 1 ? percentUsed * 100 : percentUsed)
        ),
        limit: 100,
        unit: "%",
        resetsAt: keyValue(value, ["reset_at", "resets_at", "next_reset_at", "period_end"]),
      }
    }
    if (actualUsed === null || limit === null || limit <= 0) return null
    return {
      used: Math.max(0, actualUsed),
      limit,
      unit: string(value.unit) || "credits",
      resetsAt: keyValue(value, ["reset_at", "resets_at", "next_reset_at", "period_end"]),
    }
  }
  function find(root, names) {
    const source = object(root && (root.data || root.result)) || object(root) || {}
    for (const name of names) {
      const found = quota(source[name]) || quota(root && root[name])
      if (found) return found
    }
    const list = Array.isArray(source.quotas)
      ? source.quotas
      : Array.isArray(root && root.quotas)
        ? root.quotas
        : []
    for (const item of list) {
      const label = String(
        item.label || item.name || item.period || item.window || ""
      ).toLowerCase()
      if (names.some((name) => label.includes(name.replace(/_/g, " ")))) {
        const found = quota(item)
        if (found) return found
      }
    }
    return null
  }
  function line(ctx, label, value, durationMs) {
    if (!value) return null
    return ctx.line.progress({
      label,
      used: value.used,
      limit: value.limit,
      format: value.unit === "%" ? { kind: "percent" } : { kind: "count", suffix: value.unit },
      resetsAt: ctx.util.toIso(value.resetsAt),
      periodDurationMs: durationMs,
    })
  }
  function probe(ctx) {
    const key = loadKey(ctx)
    if (!key) throw "Chutes API key missing. Save it in Setup or set CHUTES_API_KEY."
    const subscription = request(ctx, key.value, "/subscription_usage", true)
    let rolling = find(subscription, ["rolling_window", "rolling", "four_hour", "4-hour", "4h"])
    let monthly = find(subscription, ["monthly", "monthly_usage", "subscription_usage"])
    if (!rolling || !monthly) {
      const quotas = request(ctx, key.value, "/quotas", false)
      rolling = rolling || find(quotas, ["rolling_window", "rolling", "four_hour", "4-hour", "4h"])
      monthly = monthly || find(quotas, ["monthly", "monthly_usage", "subscription_usage"])
    }
    const lines = []
    const rollingLine = line(ctx, "4-hour", rolling, 4 * 60 * 60 * 1000)
    const monthlyLine = line(ctx, "Monthly", monthly, 30 * 24 * 60 * 60 * 1000)
    if (rollingLine) lines.push(rollingLine)
    if (monthlyLine) lines.push(monthlyLine)
    if (!rollingLine && !monthlyLine) throw "Chutes response missing quota data. Try again later."
    const source = object(subscription.data) || object(subscription) || {}
    const plan = string(
      source.plan_name ||
        source.plan ||
        source.tier ||
        (source.subscription && source.subscription.name)
    )
    if (plan) lines.push(ctx.line.badge({ label: "Plan", text: plan }))
    lines.push(ctx.line.text({ label: "Source", value: "Chutes subscription usage API" }))
    lines.push(ctx.line.text({ label: "Auth source", value: key.source }))
    return { lines }
  }
  globalThis.__openusage_plugin = { id: "chutes", probe }
})()
