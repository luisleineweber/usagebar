;(function () {
  function usageHistory(ctx) {
    if (!ctx.host.ccusage || typeof ctx.host.ccusage.query !== "function") return null
    var sinceDate = new Date(ctx.nowIso || Date.now())
    sinceDate.setDate(sinceDate.getDate() - 30)
    var since =
      sinceDate.getFullYear() +
      String(sinceDate.getMonth() + 1).padStart(2, "0") +
      String(sinceDate.getDate()).padStart(2, "0")
    var usage = ctx.host.ccusage.query({ provider: "qwen", since: since })
    if (!usage || usage.status !== "ok") return null
    var daily = usage.data && Array.isArray(usage.data.daily) ? usage.data.daily : []
    var entries = []
    for (var i = 0; i < daily.length; i += 1) {
      var day = daily[i] || {}
      var match = String(day.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!match) continue
      var start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      var end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1)
      var rows =
        Array.isArray(day.modelBreakdowns) && day.modelBreakdowns.length
          ? day.modelBreakdowns
          : [day]
      for (var j = 0; j < rows.length; j += 1) {
        var row = rows[j] || {}
        var entry = { periodStart: start.toISOString(), periodEnd: end.toISOString() }
        var model = String(row.modelName || row.model || "").trim()
        var total = Number(row.totalTokens)
        var cost = Number(row.cost != null ? row.cost : row.totalCost)
        var input = Number(row.inputTokens)
        var output = Number(row.outputTokens)
        var cacheRead = Number(row.cacheReadTokens)
        var cacheCreation = Number(row.cacheCreationTokens)
        var reasoning = Number(row.reasoningTokens)
        if (model) entry.model = model
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
    if (!entries.length) return null
    return { version: 1, source: "ccusage", timeZone: "system-local", entries: entries }
  }

  function probe(ctx) {
    var history = usageHistory(ctx)
    if (!history) throw "Qwen Code local usage not detected. Use Qwen Code first, then retry."
    var totalTokens = 0
    var totalCost = 0
    var hasCost = false
    for (var i = 0; i < history.entries.length; i += 1) {
      var entry = history.entries[i]
      if (Number.isFinite(entry.totalTokens)) totalTokens += entry.totalTokens
      if (Number.isFinite(entry.costUsd)) {
        totalCost += entry.costUsd
        hasCost = true
      }
    }
    var value = totalTokens.toLocaleString() + " tokens"
    if (hasCost) value += " · $" + totalCost.toFixed(2)
    return {
      plan: "Local history",
      lines: [ctx.line.text({ label: "Last 30 Days", value: value })],
      history: history,
    }
  }

  globalThis.__openusage_plugin = { id: "qwen", probe: probe }
})()
