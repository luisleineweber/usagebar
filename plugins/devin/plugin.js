;(function () {
  function string(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  function number(value) {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : null
  }
  function load(ctx, secret, envNames) {
    try {
      const value = string(ctx.host.providerSecrets.read(secret))
      if (value) return { value, source: "Stored bearer token" }
    } catch (_) {
      // A missing stored token is an expected setup state.
    }
    for (const name of envNames) {
      try {
        const value = string(ctx.host.env.get(name))
        if (value) return { value, source: name }
      } catch (_) {
        // A missing environment token is an expected setup state.
      }
    }
    return null
  }
  function organization(ctx) {
    try {
      const value = string(ctx.host.providerConfig.get("workspaceId"))
      if (value) return value
    } catch (_) {
      // A missing organization setting is an expected setup state.
    }
    for (const name of ["DEVIN_ORGANIZATION", "DEVIN_ORG"]) {
      try {
        const value = string(ctx.host.env.get(name))
        if (value) return value
      } catch (_) {
        // A missing environment organization is an expected setup state.
      }
    }
    return null
  }
  function orgId(value) {
    const match = String(value || "").match(/org_[A-Za-z0-9_-]+/)
    return match ? match[0] : null
  }
  function percent(value) {
    const n = number(value)
    if (n === null) return null
    return Math.max(0, Math.min(100, Math.abs(n) <= 1 ? n * 100 : n))
  }
  function legacyWindow(root, name) {
    const list = root.quota_usage && root.quota_usage[0] && root.quota_usage[0][name + "_quota"]
    const value = Array.isArray(list) ? list[0] : null
    if (!value) return null
    let used = percent(value.used_percent !== undefined ? value.used_percent : value.usage_percent)
    if (used === null && value.remaining_percent !== undefined)
      used = 100 - percent(value.remaining_percent)
    if (used === null && number(value.used) !== null && number(value.limit) > 0)
      used = (number(value.used) / number(value.limit)) * 100
    return used === null ? null : { used, reset: value.reset_at || value.next_reset_at }
  }
  function window(root, name) {
    const nested = root[name] && typeof root[name] === "object" ? root[name] : {}
    let used = percent(
      root[name + "_percentage"] !== undefined ? root[name + "_percentage"] : nested.used_percent
    )
    const legacy = legacyWindow(root, name)
    if (used === null) return legacy
    return { used, reset: root[name + "_reset_at"] || nested.reset_at || nested.next_reset_at }
  }
  function probe(ctx) {
    const token = load(ctx, "token", ["DEVIN_BEARER_TOKEN", "DEVIN_AUTHORIZATION"])
    if (!token) throw "Devin bearer token missing. Save it in Setup or set DEVIN_BEARER_TOKEN."
    const org = orgId(organization(ctx))
    if (!org) throw "Devin internal organization ID missing. Save an org_... ID in Setup."
    const bearer = token.value.replace(/^Bearer\s+/i, "")
    let response
    try {
      response = ctx.host.http.request({
        method: "GET",
        url: "https://app.devin.ai/api/" + org + "/billing/quota/usage",
        headers: { Authorization: "Bearer " + bearer, Accept: "application/json" },
        timeoutMs: 15000,
      })
    } catch (_) {
      throw "Devin request failed. Check your connection."
    }
    if (response.status === 401 || response.status === 403)
      throw "Devin session invalid. Save a new bearer token."
    if (response.status < 200 || response.status >= 300)
      throw "Devin request failed (HTTP " + response.status + "). Try again later."
    const data = ctx.util.tryParseJson(response.bodyText)
    if (!data || typeof data !== "object") throw "Devin response invalid. Try again later."
    const daily = data.hide_daily_quota === true ? null : window(data, "daily")
    const weekly = window(data, "weekly")
    const lines = []
    if (daily)
      lines.push(
        ctx.line.progress({
          label: "Daily",
          used: daily.used,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: ctx.util.toIso(daily.reset),
          periodDurationMs: 24 * 60 * 60 * 1000,
        })
      )
    if (weekly)
      lines.push(
        ctx.line.progress({
          label: "Weekly",
          used: weekly.used,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: ctx.util.toIso(weekly.reset),
          periodDurationMs: 7 * 24 * 60 * 60 * 1000,
        })
      )
    if (!daily && !weekly) throw "Devin response missing quota data. Try again later."
    const plan = string(data.plan || data.plan_name)
    if (plan) lines.push(ctx.line.badge({ label: "Plan", text: plan }))
    lines.push(ctx.line.text({ label: "Organization", value: org }))
    lines.push(ctx.line.text({ label: "Source", value: "Devin organization quota endpoint" }))
    lines.push(ctx.line.text({ label: "Auth source", value: token.source }))
    return { lines }
  }
  globalThis.__openusage_plugin = { id: "devin", probe }
})()
