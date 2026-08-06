;(function () {
  function string(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null
  }
  function number(value) {
    const n = typeof value === "number" ? value : Number(value)
    return Number.isFinite(n) ? n : null
  }
  function readCookie(ctx) {
    try {
      const value = string(ctx.host.providerSecrets.read("cookieHeader"))
      if (value) return { value: value.replace(/^Cookie:\s*/i, ""), source: "Stored Cookie header" }
    } catch (_) {
      // A missing stored Cookie header is an expected setup state.
    }
    for (const name of ["QODER_COOKIE_HEADER", "QODER_COOKIE"]) {
      try {
        const value = string(ctx.host.env.get(name))
        if (value) return { value: value.replace(/^Cookie:\s*/i, ""), source: name }
      } catch (_) {
        // A missing environment Cookie header is an expected setup state.
      }
    }
    return null
  }
  function host(ctx) {
    try {
      const value = String(ctx.host.providerConfig.get("workspaceId") || "").toLowerCase()
      if (value.includes(".cn") || value === "china" || value === "cn") return "qoder.com.cn"
    } catch (_) {
      // A missing host setting uses the international host.
    }
    try {
      if (String(ctx.host.env.get("QODER_REGION") || "").toLowerCase() === "china")
        return "qoder.com.cn"
    } catch (_) {
      // A missing environment region uses the international host.
    }
    return "qoder.com"
  }
  function summary(root, key) {
    const quota = root[key] || root[key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase())]
    if (!quota || typeof quota !== "object") return null
    return quota.quotaSummary || quota.quota_summary || null
  }
  function values(root, key) {
    const value = summary(root, key)
    if (!value) return null
    const used = number(value.usedValue !== undefined ? value.usedValue : value.used_value)
    const limit = number(value.limitValue !== undefined ? value.limitValue : value.limit_value)
    const remaining = number(
      value.remainingValue !== undefined ? value.remainingValue : value.remaining_value
    )
    if (
      used === null ||
      limit === null ||
      remaining === null ||
      used < 0 ||
      limit < 0 ||
      remaining < 0
    )
      return null
    if (limit === 0 && (used !== 0 || remaining !== 0)) return null
    return { used, limit, remaining }
  }
  function probe(ctx) {
    const cookie = readCookie(ctx)
    if (!cookie) throw "Qoder Cookie header missing. Save it in Setup."
    const selectedHost = host(ctx)
    const url = "https://" + selectedHost + "/api/v2/me/usages/big_model_credits"
    let response
    try {
      response = ctx.host.http.request({
        method: "GET",
        url,
        headers: {
          Cookie: cookie.value,
          Accept: "application/json",
          Origin: "https://" + selectedHost,
          Referer: "https://" + selectedHost + "/account/usage",
        },
        timeoutMs: 15000,
      })
    } catch (_) {
      throw "Qoder request failed. Check your connection."
    }
    if (response.status === 401 || response.status === 403)
      throw "Qoder session invalid or expired. Save a new Cookie header."
    if (response.status < 200 || response.status >= 300)
      throw "Qoder request failed (HTTP " + response.status + "). Try again later."
    const data = ctx.util.tryParseJson(response.bodyText)
    const root =
      data && typeof data === "object"
        ? data.data && typeof data.data === "object"
          ? data.data
          : data
        : null
    if (!root) throw "Qoder response invalid. Try again later."
    const total = values(root, "totalQuota")
    const shared = values(root, "sharedQuota")
    if (!total) throw "Qoder response missing credit data. Try again later."
    const used = total.used + (shared ? shared.used : 0)
    const limit = total.limit + (shared ? shared.limit : 0)
    const remaining = total.remaining + (shared ? shared.remaining : 0)
    const lines =
      limit === 0
        ? [ctx.line.badge({ label: "Credits", text: "No credits" })]
        : [
            ctx.line.progress({
              label: "Credits",
              used,
              limit,
              format: { kind: "count", suffix: "credits" },
              resetsAt: ctx.util.toIso(root.nextResetAt || root.next_reset_at),
            }),
          ]
    lines.push(
      ctx.line.badge({
        label: "Region",
        text: selectedHost === "qoder.com.cn" ? "China" : "International",
      })
    )
    lines.push(ctx.line.text({ label: "Remaining", value: String(remaining) + " credits" }))
    lines.push(ctx.line.text({ label: "Source", value: url }))
    lines.push(ctx.line.text({ label: "Auth source", value: cookie.source }))
    return { lines }
  }
  globalThis.__openusage_plugin = { id: "qoder", probe }
})()
