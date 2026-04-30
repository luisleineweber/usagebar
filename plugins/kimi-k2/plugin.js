(function () {
  const BALANCE_URL = "https://api.moonshot.ai/v1/users/me/balance"
  const API_KEY_ENV_VARS = ["MOONSHOT_API_KEY", "KIMI_API_KEY", "KIMI_KEY"]

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

  function formatCount(value) {
    const n = Number(value || 0)
    if (!Number.isFinite(n)) return "0"
    if (Math.abs(n - Math.round(n)) < 0.000001) return String(Math.round(n))
    return n.toFixed(2)
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
      for (let i = 0; i < API_KEY_ENV_VARS.length; i += 1) {
        const name = API_KEY_ENV_VARS[i]
        try {
          const value = readString(ctx.host.env.get(name))
          if (value) return value
        } catch (e) {
          ctx.host.log.warn("env read failed for " + name + ": " + String(e))
        }
      }
    }

    return null
  }

  function requestBalance(ctx, apiKey) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: BALANCE_URL,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request failed (" + BALANCE_URL + "): " + String(e))
      throw "Moonshot API balance request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Moonshot API key invalid. Check Setup or MOONSHOT_API_KEY."
    }

    if (resp.status < 200 || resp.status >= 300) {
      throw "Moonshot API balance request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      throw "Moonshot API balance response invalid. Try again later."
    }

    return data
  }

  function parseSummary(payload) {
    const data = payload && typeof payload === "object" ? payload.data : null
    if (!data || typeof data !== "object" || Array.isArray(data)) return null

    const available = readNumber(data.available_balance)
    const voucher = readNumber(data.voucher_balance) ?? 0
    const cash = readNumber(data.cash_balance) ?? 0
    if (available === null) return null

    return {
      available: Math.max(0, available),
      voucher: Math.max(0, voucher),
      cash: Math.max(0, cash),
    }
  }

  function probe(ctx) {
    const apiKey = loadApiKey(ctx)
    if (!apiKey) {
      throw "Moonshot API key missing. Save it in Setup or set MOONSHOT_API_KEY."
    }

    const response = requestBalance(ctx, apiKey)
    const summary = parseSummary(response)
    if (!summary) {
      throw "Moonshot API balance response invalid. Try again later."
    }

    const lines = [
      ctx.line.progress({
        label: "Balance",
        used: summary.available,
        limit: Math.max(summary.available, 1),
        format: { kind: "currency", currency: "USD" },
      }),
      ctx.line.text({
        label: "Voucher balance",
        value: "$" + formatCount(summary.voucher),
      }),
      ctx.line.text({
        label: "Cash balance",
        value: "$" + formatCount(summary.cash),
      }),
    ]

    return {
      plan: "Available: $" + formatCount(summary.available),
      lines,
    }
  }

  globalThis.__openusage_plugin = { id: "kimi-k2", probe }
})()
