(function () {
  const API_BASE_CN = "https://devops.cn-beijing.aliyuncs.com"
  const API_BASE_GLOBAL = "https://devops.aliyuncs.com"
  const DEFAULT_REGION = "cn-beijing"
  const COUNT_FORMAT = { kind: "count", suffix: "requests" }
  const WINDOW_MS = {
    fiveHour: 5 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
  }
  const PLAN_LIMITS = {
    lite: { fiveHour: 1200, weekly: 9000, monthly: 18000 },
    pro: { fiveHour: 6000, weekly: 45000, monthly: 90000 },
  }

  function loadApiKey(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = ctx.host.providerSecrets.read("apiKey")
        if (stored) return { value: stored, source: "Stored API key" }
      } catch (e) {
        ctx.host.log.warn("provider secret read failed: " + String(e))
      }
    }

    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      try {
        const envKey = ctx.host.env.get("ALIBABA_API_KEY")
        if (envKey) return { value: envKey, source: "ALIBABA_API_KEY" }
      } catch (e) {
        ctx.host.log.warn("env read failed for ALIBABA_API_KEY: " + String(e))
      }
    }

    return null
  }

  function loadRegion(ctx) {
    if (ctx.host.providerConfig && typeof ctx.host.providerConfig.get === "function") {
      try {
        const region = ctx.host.providerConfig.get("region")
        if (region) return region
      } catch (e) {
        ctx.host.log.warn("provider config read failed for region: " + String(e))
      }
    }

    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      try {
        const envRegion = ctx.host.env.get("ALIBABA_REGION")
        if (envRegion) return envRegion
      } catch (e) {
        ctx.host.log.warn("env read failed for ALIBABA_REGION: " + String(e))
      }
    }

    return DEFAULT_REGION
  }

  function getApiBase(region) {
    if (region && region.startsWith("cn-")) {
      return API_BASE_CN
    }
    return API_BASE_GLOBAL
  }

  function requestQuotas(ctx, apiKey, region) {
    const baseUrl = getApiBase(region)
    const url = baseUrl + "/webapi/codingplan/quotas"

    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: url,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
          "X-Region": region,
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request failed (" + url + "): " + String(e))
      throw "Alibaba request failed. Check your connection."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    const code = data && typeof data.code === "string" ? data.code : ""
    const message = data && typeof data.message === "string" ? data.message : ""
    if (code === "ConsoleNeedLogin" || message.includes("ConsoleNeedLogin")) {
      throw "Alibaba Coding Plan quota requires a browser console session for this account or region. Check region/account access."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Alibaba API key invalid. Check Setup or ALIBABA_API_KEY."
    }

    if (resp.status < 200 || resp.status >= 300) {
      throw "Alibaba request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    if (!data || typeof data !== "object") {
      throw "Alibaba response invalid. Try again later."
    }

    return { data, endpoint: url }
  }

  function requestQuotasWithCookie(ctx, cookie, region) {
    const baseUrl = getApiBase(region)
    const url = baseUrl + "/webapi/codingplan/quotas"

    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: url,
        headers: {
          Cookie: cookie,
          Accept: "application/json",
          "X-Region": region,
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request failed (" + url + "): " + String(e))
      throw "Alibaba request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Alibaba cookie invalid. Sign in via browser."
    }

    if (resp.status < 200 || resp.status >= 300) {
      throw "Alibaba request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      throw "Alibaba response invalid. Try again later."
    }

    return data
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  function readObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  }

  function readPlanKey(plan) {
    const text = typeof plan === "string" ? plan.toLowerCase() : ""
    if (text.includes("lite")) return "lite"
    if (text.includes("pro")) return "pro"
    return null
  }

  function firstObject(root, keys) {
    for (let i = 0; i < keys.length; i++) {
      const value = readObject(root[keys[i]])
      if (value) return value
    }
    return null
  }

  function firstNumber(root, keys) {
    for (let i = 0; i < keys.length; i++) {
      const value = readNumber(root[keys[i]])
      if (value !== null) return value
    }
    return null
  }

  function parseQuotaWindow(root, keys, fallbackLimit) {
    const value = firstObject(root, keys)
    if (!value) {
      return fallbackLimit ? { used: 0, limit: fallbackLimit, resetsAt: null } : null
    }

    const used = firstNumber(value, ["used", "usage", "consumed", "current", "requestUsed", "requestsUsed"]) ?? 0
    const remaining = firstNumber(value, ["remaining", "available", "left", "requestRemaining", "requestsRemaining"])
    let limit = firstNumber(value, ["limit", "quota", "total", "maximum", "max", "requestLimit", "requestsLimit"])
    if (limit === null && remaining !== null) limit = used + remaining
    if (limit === null) limit = fallbackLimit
    if (limit === null) return null
    if (limit <= 0) return null

    return {
      used: Math.max(0, used),
      limit,
      resetsAt: value.resetsAt || value.resetAt || value.reset_at || value.nextResetAt || null,
    }
  }

  function parseQuota(data) {
    if (!data.data || typeof data.data !== "object") {
      return null
    }

    const quotas = data.data
    const plan = typeof quotas.plan === "string" ? quotas.plan : "Coding Plan"
    const planKey = readPlanKey(plan)
    const planLimits = planKey ? PLAN_LIMITS[planKey] : null
    const fiveHour = parseQuotaWindow(
      quotas,
      ["fiveHourQuota", "five_hour_quota", "fiveHour", "slidingQuota", "dailyQuota"],
      planLimits && planLimits.fiveHour
    )
    const weekly = parseQuotaWindow(quotas, ["weeklyQuota", "weekQuota", "weekly"], planLimits && planLimits.weekly)
    const monthly = parseQuotaWindow(quotas, ["monthlyQuota", "monthQuota", "monthly"], planLimits && planLimits.monthly)

    return {
      plan: plan,
      fiveHour,
      weekly,
      monthly,
    }
  }

  function pushQuotaLine(ctx, lines, label, quota, periodDurationMs) {
    if (!quota) return
    lines.push(ctx.line.progress({
      label: label,
      used: quota.used,
      limit: quota.limit,
      format: COUNT_FORMAT,
      resetsAt: ctx.util.toIso(quota.resetsAt),
      periodDurationMs: periodDurationMs,
    }))
  }

  function probe(ctx) {
    const region = loadRegion(ctx)
    const apiKey = loadApiKey(ctx)

    if (!apiKey) {
      throw "Alibaba API key missing. Save it in Setup or set ALIBABA_API_KEY."
    }

    const payload = requestQuotas(ctx, apiKey.value, region)
    const quota = parseQuota(payload.data)

    if (!quota) {
      throw "Alibaba quota response missing usage data. Try again later."
    }

    const lines = []

    pushQuotaLine(ctx, lines, "5-hour", quota.fiveHour, WINDOW_MS.fiveHour)
    pushQuotaLine(ctx, lines, "Weekly", quota.weekly, WINDOW_MS.weekly)
    pushQuotaLine(ctx, lines, "Monthly", quota.monthly, WINDOW_MS.monthly)

    if (lines.length === 0) {
      throw "Alibaba quota response missing usage data. Try again later."
    }

    lines.push(ctx.line.badge({
      label: "Plan",
      text: quota.plan,
    }))

    lines.push(ctx.line.badge({
      label: "Region",
      text: region,
    }))

    lines.push(ctx.line.text({
      label: "Source",
      value: "Alibaba Coding Plan quota endpoint",
    }))

    lines.push(ctx.line.text({
      label: "Auth source",
      value: apiKey.source,
    }))

    lines.push(ctx.line.text({
      label: "Endpoint",
      value: payload.endpoint,
    }))

    return {
      plan: quota.plan,
      lines: lines,
    }
  }

  globalThis.__openusage_plugin = { id: "alibaba", probe }
})()
