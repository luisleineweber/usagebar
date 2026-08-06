;(function () {
  const URL = "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"
  const MODEL = "doubao-seed-2.0-code"

  function readString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null
  }

  function loadKey(ctx) {
    try {
      const value = readString(ctx.host.providerSecrets.read("apiKey"))
      if (value) return { value, source: "Stored API key" }
    } catch (_) {
      // A missing stored key is an expected setup state.
    }
    for (const name of ["ARK_API_KEY", "VOLCENGINE_API_KEY", "DOUBAO_API_KEY"]) {
      try {
        const value = readString(ctx.host.env.get(name))
        if (value) return { value, source: name }
      } catch (_) {
        // A missing environment key is an expected setup state.
      }
    }
    return null
  }

  function header(headers, name) {
    const expected = name.toLowerCase()
    for (const key of Object.keys(headers || {})) {
      if (key.toLowerCase() === expected) return readString(String(headers[key]))
    }
    return null
  }

  function resetIso(ctx, value) {
    if (!value) return null
    const iso = ctx.util.toIso(value)
    if (iso) return iso
    let seconds = 0
    const pattern = /(\d+)([dhms])/g
    let match
    while ((match = pattern.exec(value))) {
      const amount = Number(match[1])
      seconds += amount * ({ d: 86400, h: 3600, m: 60, s: 1 }[match[2]] || 0)
    }
    return seconds > 0 ? new Date(Date.parse(ctx.nowIso) + seconds * 1000).toISOString() : null
  }

  function probe(ctx) {
    const key = loadKey(ctx)
    if (!key) throw "Doubao API key missing. Save it in Setup or set ARK_API_KEY."

    let response
    try {
      response = ctx.host.http.request({
        method: "POST",
        url: URL,
        headers: {
          Authorization: "Bearer " + key.value,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        bodyText: JSON.stringify({
          model: MODEL,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        timeoutMs: 15000,
      })
    } catch (_) {
      throw "Doubao request failed. Check your connection."
    }
    if (response.status === 401 || response.status === 403)
      throw "Doubao API key invalid. Check Setup."
    if (response.status !== 200 && response.status !== 429) {
      throw "Doubao request failed (HTTP " + response.status + "). Try again later."
    }

    const remaining = Number(header(response.headers, "x-ratelimit-remaining-requests"))
    const limit = Number(header(response.headers, "x-ratelimit-limit-requests"))
    const lines = []
    if (Number.isFinite(remaining) && Number.isFinite(limit) && limit > 0) {
      lines.push(
        ctx.line.progress({
          label: "Requests",
          used: Math.max(0, limit - remaining),
          limit,
          format: { kind: "count", suffix: "requests" },
          resetsAt: resetIso(ctx, header(response.headers, "x-ratelimit-reset-requests")),
        })
      )
    }
    lines.push(
      ctx.line.badge({ label: "Status", text: response.status === 429 ? "Rate limited" : "Active" })
    )
    lines.push(ctx.line.text({ label: "Source", value: "Volcengine Ark rate-limit headers" }))
    lines.push(ctx.line.text({ label: "Auth source", value: key.source }))
    return { lines }
  }

  globalThis.__openusage_plugin = { id: "doubao", probe }
})()
