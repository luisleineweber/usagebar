;(function () {
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

  function readString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null
  }

  function loadTokenPlanCookie(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = readString(ctx.host.providerSecrets.read("cookieHeader"))
        if (stored)
          return { value: stored.replace(/^Cookie:\s*/i, ""), source: "Stored Cookie header" }
      } catch (error) {
        ctx.host.log.warn("provider secret read failed for cookieHeader: " + String(error))
      }
    }
    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      try {
        const stored = readString(ctx.host.env.get("ALIBABA_TOKEN_PLAN_COOKIE_HEADER"))
        if (stored)
          return {
            value: stored.replace(/^Cookie:\s*/i, ""),
            source: "ALIBABA_TOKEN_PLAN_COOKIE_HEADER",
          }
      } catch (error) {
        ctx.host.log.warn("env read failed for ALIBABA_TOKEN_PLAN_COOKIE_HEADER: " + String(error))
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

    const used =
      firstNumber(value, ["used", "usage", "consumed", "current", "requestUsed", "requestsUsed"]) ??
      0
    const remaining = firstNumber(value, [
      "remaining",
      "available",
      "left",
      "requestRemaining",
      "requestsRemaining",
    ])
    let limit = firstNumber(value, [
      "limit",
      "quota",
      "total",
      "maximum",
      "max",
      "requestLimit",
      "requestsLimit",
    ])
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
    const weekly = parseQuotaWindow(
      quotas,
      ["weeklyQuota", "weekQuota", "weekly"],
      planLimits && planLimits.weekly
    )
    const monthly = parseQuotaWindow(
      quotas,
      ["monthlyQuota", "monthQuota", "monthly"],
      planLimits && planLimits.monthly
    )

    return {
      plan: plan,
      fiveHour,
      weekly,
      monthly,
    }
  }

  function pushQuotaLine(ctx, lines, label, quota, periodDurationMs) {
    if (!quota) return
    lines.push(
      ctx.line.progress({
        label: label,
        used: quota.used,
        limit: quota.limit,
        format: COUNT_FORMAT,
        resetsAt: ctx.util.toIso(quota.resetsAt),
        periodDurationMs: periodDurationMs,
      })
    )
  }

  function cookieValue(cookieHeader, name) {
    const parts = String(cookieHeader).split(";")
    for (let i = 0; i < parts.length; i++) {
      const pair = parts[i].trim()
      const separator = pair.indexOf("=")
      if (separator > 0 && pair.slice(0, separator).trim() === name)
        return pair.slice(separator + 1).trim()
    }
    return null
  }

  function findNested(root, keys) {
    if (!root || typeof root !== "object") return null
    for (const key of keys) {
      if (root[key] !== undefined && root[key] !== null) return root[key]
    }
    for (const value of Object.values(root)) {
      if (value && typeof value === "object") {
        const found = findNested(value, keys)
        if (found !== null) return found
      }
      if (typeof value === "string" && value.trim().startsWith("{")) {
        const parsed = ctxSafeJson(value)
        const found = parsed ? findNested(parsed, keys) : null
        if (found !== null) return found
      }
    }
    return null
  }

  function ctxSafeJson(value) {
    try {
      return JSON.parse(value)
    } catch (_) {
      return null
    }
  }

  function fetchTokenPlan(ctx, cookie) {
    const dashboard =
      "https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan"
    let secToken = cookieValue(cookie.value, "sec_token")
    if (!secToken) {
      try {
        const preflight = ctx.host.http.request({
          method: "GET",
          url: dashboard,
          headers: { Cookie: cookie.value, Accept: "text/html" },
          timeoutMs: 10000,
        })
        if (preflight.status === 200) {
          const match = String(preflight.bodyText || "").match(
            /sec_token\s*[=:]\s*["']([^"']+)["']/
          )
          if (match) secToken = match[1]
        }
      } catch (_) {
        // The sec_token cookie remains a valid fallback when preflight fails.
      }
    }
    const url =
      "https://bailian.console.aliyun.com/data/api.json?action=GetSubscriptionSummary&product=BssOpenAPI-V3&_tag="
    const fields = [
      ["product", "BssOpenAPI-V3"],
      ["action", "GetSubscriptionSummary"],
      ["params", JSON.stringify({ ProductCode: "sfm_tokenplanteams_dp_cn" })],
      ["region", "cn-beijing"],
    ]
    if (secToken) fields.push(["sec_token", secToken])
    const bodyText = fields
      .map((pair) => encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]))
      .join("&")
    let response
    try {
      response = ctx.host.http.request({
        method: "POST",
        url,
        headers: {
          Cookie: cookie.value,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://bailian.console.aliyun.com",
          Referer: dashboard,
          "X-Requested-With": "XMLHttpRequest",
        },
        bodyText,
        timeoutMs: 20000,
      })
    } catch (_) {
      throw "Alibaba Token Plan request failed. Check your connection."
    }
    if (response.status === 401 || response.status === 403)
      throw "Alibaba Token Plan login required. Save a new Cookie header."
    const data = ctx.util.tryParseJson(response.bodyText)
    const code = data && String(data.code || data.Code || "")
    if (code === "ConsoleNeedLogin" || code === "PostonlyOrTokenError")
      throw "Alibaba Token Plan login required. Save a new Cookie header."
    if (response.status < 200 || response.status >= 300)
      throw "Alibaba Token Plan request failed (HTTP " + response.status + ")."
    if (!data || typeof data !== "object")
      throw "Alibaba Token Plan response invalid. Try again later."
    const total = readNumber(findNested(data, ["TotalValue", "totalValue", "totalQuota"]))
    const remaining = readNumber(
      findNested(data, ["TotalSurplusValue", "totalSurplusValue", "remainingQuota"])
    )
    const count = readNumber(findNested(data, ["TotalCount", "totalCount"]))
    const expiresAt = findNested(data, ["NearestExpireDate", "nearestExpireDate", "expiresAt"])
    if (count === 0) {
      return [
        ctx.line.badge({ label: "Plan", text: "No active Token Plan" }),
        ctx.line.text({ label: "Source", value: "Alibaba Bailian subscription summary" }),
      ]
    }
    if (total === null || remaining === null || total <= 0)
      throw "Alibaba Token Plan response missing credit data. Try again later."
    return [
      ctx.line.progress({
        label: "Token credits",
        used: Math.max(0, total - remaining),
        limit: total,
        format: { kind: "count", suffix: "credits" },
        resetsAt: ctx.util.toIso(expiresAt),
      }),
      ctx.line.text({ label: "Source", value: "Alibaba Bailian subscription summary" }),
      ctx.line.text({ label: "Auth source", value: cookie.source }),
    ]
  }

  function probe(ctx) {
    const region = loadRegion(ctx)
    const apiKey = loadApiKey(ctx)
    const tokenPlanCookie = loadTokenPlanCookie(ctx)

    if (!apiKey && !tokenPlanCookie) {
      throw "Alibaba credentials missing. Save a Coding Plan API key, a Token Plan Cookie header, or both in Setup."
    }

    const lines = []

    if (tokenPlanCookie) lines.push.apply(lines, fetchTokenPlan(ctx, tokenPlanCookie))

    if (!apiKey) return { plan: "TOKEN PLAN", lines }

    const payload = requestQuotas(ctx, apiKey.value, region)
    const quota = parseQuota(payload.data)

    if (!quota) {
      throw "Alibaba quota response missing usage data. Try again later."
    }

    pushQuotaLine(ctx, lines, "5-hour", quota.fiveHour, WINDOW_MS.fiveHour)
    pushQuotaLine(ctx, lines, "Weekly", quota.weekly, WINDOW_MS.weekly)
    pushQuotaLine(ctx, lines, "Monthly", quota.monthly, WINDOW_MS.monthly)

    if (lines.length === 0) {
      throw "Alibaba quota response missing usage data. Try again later."
    }

    lines.push(
      ctx.line.badge({
        label: "Plan",
        text: quota.plan,
      })
    )

    lines.push(
      ctx.line.badge({
        label: "Region",
        text: region,
      })
    )

    lines.push(
      ctx.line.text({
        label: "Source",
        value: "Alibaba Coding Plan quota endpoint",
      })
    )

    lines.push(
      ctx.line.text({
        label: "Auth source",
        value: apiKey.source,
      })
    )

    lines.push(
      ctx.line.text({
        label: "Endpoint",
        value: payload.endpoint,
      })
    )

    return {
      plan: quota.plan,
      lines: lines,
    }
  }

  globalThis.__openusage_plugin = { id: "alibaba", probe }
})()
