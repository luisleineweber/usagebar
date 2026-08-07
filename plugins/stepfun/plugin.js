;(function () {
  const BASE = "https://platform.stepfun.com/api/step.openapi.devcenter.Dashboard/"
  const WEB_ID = "c8a1002d2c457e758785a9979832217c7c0b884c"
  function string(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  function number(value) {
    if (value === null || value === undefined || (typeof value === "string" && !value.trim()))
      return null
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : null
  }
  function usedPercent(leftRate) {
    return Math.round(Math.max(0, Math.min(100, (1 - leftRate) * 100)) * 1000000) / 1000000
  }
  function loadToken(ctx) {
    try {
      const value = string(ctx.host.providerSecrets.read("token"))
      if (value) return { value, source: "Stored Oasis-Token" }
    } catch (_) {
      // A missing stored token is an expected setup state.
    }
    try {
      const value = string(ctx.host.env.get("STEPFUN_TOKEN"))
      if (value) return { value, source: "STEPFUN_TOKEN" }
    } catch (_) {
      // A missing environment token is an expected setup state.
    }
    return null
  }
  function request(ctx, token, action, required) {
    let response
    try {
      response = ctx.host.http.request({
        method: "POST",
        url: BASE + action,
        headers: {
          Cookie: "Oasis-Token=" + token + "; Oasis-Webid=" + WEB_ID,
          Accept: "application/json",
          "Content-Type": "application/json",
          "oasis-appid": "10300",
          "oasis-platform": "web",
          "oasis-webid": WEB_ID,
        },
        bodyText: "{}",
        timeoutMs: 15000,
      })
    } catch (_) {
      if (required) throw "StepFun request failed. Check your connection."
      return null
    }
    if (response.status === 401 || response.status === 403)
      throw "StepFun token invalid or expired. Save a new Oasis-Token."
    if (response.status < 200 || response.status >= 300) {
      if (required) throw "StepFun request failed (HTTP " + response.status + "). Try again later."
      return null
    }
    const data = ctx.util.tryParseJson(response.bodyText)
    if ((!data || typeof data !== "object") && required)
      throw "StepFun response invalid. Try again later."
    return data
  }
  function probe(ctx) {
    const token = loadToken(ctx)
    if (!token) throw "StepFun Oasis-Token missing. Save it in Setup or set STEPFUN_TOKEN."
    const usage = request(ctx, token.value, "QueryStepPlanRateLimit", true)
    if (usage.status !== undefined && usage.status !== 1 && usage.status !== true)
      throw "StepFun quota request failed. Save a new Oasis-Token if it expired."
    const fiveLeft = number(usage.five_hour_usage_left_rate)
    const weeklyLeft = number(usage.weekly_usage_left_rate)
    if (fiveLeft === null || weeklyLeft === null)
      throw "StepFun response missing quota data. Try again later."
    const lines = [
      ctx.line.progress({
        label: "5-hour",
        used: usedPercent(fiveLeft),
        limit: 100,
        format: { kind: "percent" },
        resetsAt: ctx.util.toIso(usage.five_hour_usage_reset_time),
        periodDurationMs: 5 * 60 * 60 * 1000,
      }),
      ctx.line.progress({
        label: "Weekly",
        used: usedPercent(weeklyLeft),
        limit: 100,
        format: { kind: "percent" },
        resetsAt: ctx.util.toIso(usage.weekly_usage_reset_time),
        periodDurationMs: 7 * 24 * 60 * 60 * 1000,
      }),
    ]
    const planResponse = request(ctx, token.value, "GetStepPlanStatus", false)
    const plan =
      planResponse && planResponse.subscription ? string(planResponse.subscription.name) : null
    if (plan) lines.push(ctx.line.badge({ label: "Plan", text: plan }))
    lines.push(ctx.line.text({ label: "Source", value: "StepFun Step Plan rate-limit API" }))
    lines.push(ctx.line.text({ label: "Auth source", value: token.source }))
    return { lines }
  }
  globalThis.__openusage_plugin = { id: "stepfun", probe }
})()
