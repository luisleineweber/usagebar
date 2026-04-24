(function () {
  const API_BASE_CN = "https://devops.cn-beijing.aliyuncs.com"
  const API_BASE_GLOBAL = "https://devops.aliyuncs.com"
  const DEFAULT_REGION = "cn-beijing"

  function loadApiKey(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = ctx.host.providerSecrets.read("apiKey")
        if (stored) return stored
      } catch (e) {
        ctx.host.log.warn("provider secret read failed: " + String(e))
      }
    }

    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      try {
        const envKey = ctx.host.env.get("ALIBABA_API_KEY")
        if (envKey) return envKey
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

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Alibaba API key invalid. Check Setup or ALIBABA_API_KEY."
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

  function parseQuota(data) {
    if (!data.data || typeof data.data !== "object") {
      return null
    }

    const quotas = data.data
    const plan = typeof quotas.plan === "string" ? quotas.plan : "Coding Plan"
    const dailyQuota = quotas.dailyQuota || {}
    const weeklyQuota = quotas.weeklyQuota || {}

    const dailyUsed = typeof dailyQuota.used === "number" ? dailyQuota.used : 0
    const dailyLimit = typeof dailyQuota.limit === "number" ? dailyQuota.limit : 100
    const dailyResetAt = dailyQuota.resetsAt || null

    const weeklyUsed = typeof weeklyQuota.used === "number" ? weeklyQuota.used : 0
    const weeklyLimit = typeof weeklyQuota.limit === "number" ? weeklyQuota.limit : 500
    const weeklyResetAt = weeklyQuota.resetsAt || null

    return {
      plan: plan,
      daily: {
        used: dailyUsed,
        limit: Math.max(dailyLimit, dailyUsed, 1),
        percent: dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0,
        resetsAt: dailyResetAt,
      },
      weekly: {
        used: weeklyUsed,
        limit: Math.max(weeklyLimit, weeklyUsed, 1),
        percent: weeklyLimit > 0 ? (weeklyUsed / weeklyLimit) * 100 : 0,
        resetsAt: weeklyResetAt,
      },
    }
  }

  function probe(ctx) {
    const region = loadRegion(ctx)
    const apiKey = loadApiKey(ctx)

    if (!apiKey) {
      throw "Alibaba API key missing. Save it in Setup or set ALIBABA_API_KEY."
    }

    const payload = requestQuotas(ctx, apiKey, region)
    const quota = parseQuota(payload)

    if (!quota) {
      throw "Alibaba quota response missing usage data. Try again later."
    }

    const lines = []

    lines.push(ctx.line.progress({
      label: "Daily",
      used: quota.daily.percent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(quota.daily.resetsAt),
      periodDurationMs: 24 * 60 * 60 * 1000,
    }))

    lines.push(ctx.line.progress({
      label: "Weekly",
      used: quota.weekly.percent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(quota.weekly.resetsAt),
      periodDurationMs: 7 * 24 * 60 * 60 * 1000,
    }))

    lines.push(ctx.line.badge({
      label: "Region",
      text: region,
    }))

    return {
      plan: quota.plan,
      lines: lines,
    }
  }

  globalThis.__openusage_plugin = { id: "alibaba", probe }
})()
