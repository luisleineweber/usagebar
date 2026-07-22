;(function () {
  var SECRETS_FILE = "~/.local/share/amp/secrets.json"
  var SECRETS_KEY = "apiKey@https://ampcode.com/"
  var API_URL = "https://ampcode.com/api/internal"

  function readString(value) {
    if (typeof value !== "string") return null
    var trimmed = value.trim()
    return trimmed || null
  }

  function loadStoredApiKey(ctx) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function")
      return null
    try {
      var key = readString(ctx.host.providerSecrets.read("apiKey"))
      if (key) {
        ctx.host.log.info("api key loaded from provider secret")
        return key
      }
    } catch (e) {
      ctx.host.log.warn("provider secret read failed: " + String(e))
    }
    return null
  }

  function loadApiKey(ctx) {
    var stored = loadStoredApiKey(ctx)
    if (stored) return stored

    if (!ctx.host.fs.exists(SECRETS_FILE)) return null
    try {
      var text = ctx.host.fs.readText(SECRETS_FILE)
      var parsed = ctx.util.tryParseJson(text)
      var fileKey = readString(parsed && parsed[SECRETS_KEY])
      if (fileKey) {
        ctx.host.log.info("api key loaded from secrets file")
        return fileKey
      }
    } catch (e) {
      ctx.host.log.warn("secrets file read failed: " + String(e))
    }
    return null
  }

  function fetchBalanceInfo(ctx, apiKey) {
    return ctx.util.requestJson({
      method: "POST",
      url: API_URL,
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      bodyText: JSON.stringify({ method: "userDisplayBalanceInfo", params: {} }),
      timeoutMs: 15000,
    })
  }

  function parseMoney(s) {
    return Number(s.replace(/,/g, ""))
  }

  function parseBalanceText(text) {
    if (!text || typeof text !== "string") return null

    var result = {
      remaining: null,
      total: null,
      hourlyRate: 0,
      bonusPct: null,
      bonusDays: null,
      credits: null,
    }

    var balanceMatch = text.match(
      /\$([0-9][0-9,]*(?:\.[0-9]+)?)\/\$([0-9][0-9,]*(?:\.[0-9]+)?) remaining/
    )
    if (balanceMatch) {
      var remaining = parseMoney(balanceMatch[1])
      var total = parseMoney(balanceMatch[2])
      if (Number.isFinite(remaining) && Number.isFinite(total)) {
        result.remaining = remaining
        result.total = total
      }
    }

    var rateMatch = text.match(/replenishes \+\$([0-9][0-9,]*(?:\.[0-9]+)?)\/hour/)
    if (rateMatch) {
      var rate = parseMoney(rateMatch[1])
      if (Number.isFinite(rate)) result.hourlyRate = rate
    }

    var bonusMatch = text.match(/\+(\d+)% bonus for (\d+) more days?/)
    if (bonusMatch) {
      var pct = Number(bonusMatch[1])
      var days = Number(bonusMatch[2])
      if (Number.isFinite(pct) && Number.isFinite(days)) {
        result.bonusPct = pct
        result.bonusDays = days
      }
    }

    var creditsMatch = text.match(/Individual credits: \$([0-9][0-9,]*(?:\.[0-9]+)?) remaining/)
    if (creditsMatch) {
      var credits = parseMoney(creditsMatch[1])
      if (Number.isFinite(credits)) result.credits = credits
    }

    if (result.total === null && result.credits === null) return null

    return result
  }

  function probe(ctx) {
    var apiKey = loadApiKey(ctx)
    if (!apiKey) {
      throw "Amp API key missing. Save it in Setup or install Amp Code and run `amp login`."
    }

    var result
    try {
      result = fetchBalanceInfo(ctx, apiKey)
    } catch (e) {
      ctx.host.log.error("balance info request failed: " + String(e))
      throw "Request failed. Check your connection."
    }

    var resp = result.resp
    var json = result.json

    if (resp.status === 401 || resp.status === 403) {
      throw "Session expired. Re-authenticate in Amp Code."
    }
    if (resp.status < 200 || resp.status >= 300) {
      var detail = json && json.error && json.error.message ? json.error.message : ""
      if (detail) {
        ctx.host.log.error("api returned " + resp.status + ": " + detail)
        throw detail
      }
      ctx.host.log.error("api returned: " + resp.status)
      throw "Request failed (HTTP " + resp.status + "). Try again later."
    }

    if (!json || !json.ok || !json.result || !json.result.displayText) {
      ctx.host.log.error("unexpected response structure")
      throw "Could not parse usage data."
    }

    var balance = parseBalanceText(json.result.displayText)
    if (!balance) {
      if (/Amp Free/.test(json.result.displayText)) {
        ctx.host.log.error("failed to parse display text: " + json.result.displayText)
        throw "Could not parse usage data."
      }
      ctx.host.log.warn("no balance data found, assuming credits-only: " + json.result.displayText)
      balance = {
        remaining: null,
        total: null,
        hourlyRate: 0,
        bonusPct: null,
        bonusDays: null,
        credits: 0,
      }
    }

    var lines = []
    var plan = "Free"

    if (balance.total !== null) {
      var used = Math.max(0, balance.total - balance.remaining)
      var total = balance.total

      var resetsAtMs = null
      if (used > 0 && balance.hourlyRate > 0) {
        var hoursToFull = used / balance.hourlyRate
        resetsAtMs = Date.now() + hoursToFull * 3600 * 1000
      }

      lines.push(
        ctx.line.progress({
          label: "Free",
          used: used,
          limit: total,
          format: { kind: "dollars" },
          resetsAt: ctx.util.toIso(resetsAtMs),
          periodDurationMs: 24 * 3600 * 1000,
        })
      )

      if (balance.bonusPct && balance.bonusDays) {
        lines.push(
          ctx.line.text({
            label: "Bonus",
            value: "+" + balance.bonusPct + "% for " + balance.bonusDays + "d",
          })
        )
      }
    }

    if (balance.credits !== null && balance.total === null) plan = "Credits"

    if (balance.credits !== null && (balance.credits > 0 || balance.total === null)) {
      lines.push(
        ctx.line.text({
          label: "Credits",
          value: "$" + balance.credits.toFixed(2),
        })
      )
    }

    return { plan: plan, lines: lines }
  }

  function addCcusageHistory(ctx, result, provider) {
    if (
      !result ||
      result.history ||
      !ctx.host.ccusage ||
      typeof ctx.host.ccusage.query !== "function"
    )
      return result
    var sinceDate = new Date(ctx.nowIso || Date.now())
    sinceDate.setDate(sinceDate.getDate() - 30)
    var since =
      sinceDate.getFullYear() +
      String(sinceDate.getMonth() + 1).padStart(2, "0") +
      String(sinceDate.getDate()).padStart(2, "0")
    var usage = ctx.host.ccusage.query({ provider: provider, since: since })
    var daily =
      usage && usage.status === "ok" && usage.data && Array.isArray(usage.data.daily)
        ? usage.data.daily
        : []
    var entries = []
    for (var i = 0; i < daily.length; i += 1) {
      var m = String((daily[i] && daily[i].date) || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) continue
      var start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      var end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)
      var rows =
        Array.isArray(daily[i].modelBreakdowns) && daily[i].modelBreakdowns.length
          ? daily[i].modelBreakdowns
          : [daily[i]]
      for (var j = 0; j < rows.length; j += 1) {
        var row = rows[j] || {},
          entry = { periodStart: start.toISOString(), periodEnd: end.toISOString() }
        var model = String(row.modelName || row.model || "").trim()
        if (model) entry.model = model
        var input = Number(row.inputTokens),
          output = Number(row.outputTokens),
          cacheRead = Number(row.cacheReadTokens),
          cacheCreation = Number(row.cacheCreationTokens),
          reasoning = Number(row.reasoningTokens),
          total = Number(row.totalTokens),
          cost = Number(row.cost != null ? row.cost : row.totalCost)
        if (Number.isFinite(input) && input >= 0) entry.inputTokens = input
        if (Number.isFinite(output) && output >= 0) entry.outputTokens = output
        if (Number.isFinite(cacheRead) && cacheRead >= 0) entry.cacheReadTokens = cacheRead
        if (Number.isFinite(cacheCreation) && cacheCreation >= 0)
          entry.cacheCreationTokens = cacheCreation
        if (Number.isFinite(reasoning) && reasoning >= 0) entry.reasoningTokens = reasoning
        if (Number.isFinite(total) && total >= 0) entry.totalTokens = total
        if (Number.isFinite(cost) && cost >= 0) entry.costUsd = cost
        if (Object.keys(entry).length > 2) entries.push(entry)
      }
    }
    if (entries.length)
      result.history = { version: 1, source: "ccusage", timeZone: "system-local", entries: entries }
    return result
  }
  var probeCore = probe
  globalThis.__openusage_plugin = {
    id: "amp",
    probe: function (ctx) {
      return addCcusageHistory(ctx, probeCore(ctx), "amp")
    },
  }
})()
