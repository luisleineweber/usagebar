(function () {
  const BALANCE_URL = "https://api.deepseek.com/user/balance"
  const API_KEY_ENV_VARS = ["DEEPSEEK_API_KEY", "DEEPSEEK_KEY"]

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

  function formatMoney(value, currency) {
    const symbol = currency === "CNY" ? "¥" : "$"
    return symbol + Number(value || 0).toFixed(2)
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
      ctx.host.log.error("DeepSeek balance request failed: " + String(e))
      throw "DeepSeek balance request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "DeepSeek API key invalid. Check Setup or DEEPSEEK_API_KEY."
    }

    if (resp.status < 200 || resp.status >= 300) {
      throw "DeepSeek balance request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw "DeepSeek balance response invalid. Try again later."
    }

    return data
  }

  function parseBalance(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
    const infos = Array.isArray(payload.balance_infos) ? payload.balance_infos : []
    const preferred = infos.find((info) => info && info.currency === "USD") || infos[0]

    if (!preferred || typeof preferred !== "object") {
      return {
        isAvailable: false,
        currency: "USD",
        totalBalance: 0,
        grantedBalance: 0,
        toppedUpBalance: 0,
      }
    }

    const totalBalance = readNumber(preferred.total_balance)
    const grantedBalance = readNumber(preferred.granted_balance)
    const toppedUpBalance = readNumber(preferred.topped_up_balance)
    if (totalBalance === null || grantedBalance === null || toppedUpBalance === null) return null

    return {
      isAvailable: payload.is_available === true,
      currency: readString(preferred.currency) || "USD",
      totalBalance: Math.max(0, totalBalance),
      grantedBalance: Math.max(0, grantedBalance),
      toppedUpBalance: Math.max(0, toppedUpBalance),
    }
  }

  function probe(ctx) {
    const apiKey = loadApiKey(ctx)
    if (!apiKey) {
      throw "DeepSeek API key missing. Save it in Setup or set DEEPSEEK_API_KEY."
    }

    const summary = parseBalance(requestBalance(ctx, apiKey))
    if (!summary) {
      throw "DeepSeek balance response invalid. Try again later."
    }

    const total = formatMoney(summary.totalBalance, summary.currency)
    const lines = [
      ctx.line.text({
        label: "Balance",
        value: total,
      }),
      ctx.line.text({ label: "Paid balance", value: formatMoney(summary.toppedUpBalance, summary.currency) }),
      ctx.line.text({ label: "Granted balance", value: formatMoney(summary.grantedBalance, summary.currency) }),
    ]

    if (!summary.isAvailable && summary.totalBalance > 0) {
      lines.push(ctx.line.text({ label: "API availability", value: "Unavailable for API calls" }))
    }

    return {
      plan: summary.totalBalance > 0 ? "Balance: " + total : total + " - add credits",
      lines,
    }
  }

  globalThis.__openusage_plugin = { id: "deepseek", probe }
})()
