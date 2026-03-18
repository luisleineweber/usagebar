(function () {
  var LS_SERVICE = "exa.language_server_pb.LanguageServerService"
  var CLOUD_CODE_URLS = [
    "https://daily-cloudcode-pa.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
  ]
  var FETCH_MODELS_PATH = "/v1internal:fetchAvailableModels"
  var GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com/token"
  var GOOGLE_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
  var GOOGLE_CLIENT_SECRET = "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"
  var QUOTA_PERIOD_MS = 5 * 60 * 60 * 1000
  var BLACKLISTED_MODEL_IDS = {
    "MODEL_CHAT_20706": true,
    "MODEL_CHAT_23310": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH_THINKING": true,
    "MODEL_GOOGLE_GEMINI_2_5_FLASH_LITE": true,
    "MODEL_GOOGLE_GEMINI_2_5_PRO": true,
    "MODEL_PLACEHOLDER_M19": true,
  }
  var EXTRA_IMAGE_MODEL_KEY = "gemini-3-pro-image"
  var EXTRA_IMAGE_MODEL_ID = "MODEL_PLACEHOLDER_M9"
  var FAMILY_LABELS = {
    gemini_pro: "Gemini Pro",
    gemini_flash: "Gemini Flash",
    gemini_image: "Gemini Image",
    claude: "Claude",
    other: "Other",
  }
  var FAMILY_PRIORITY = {
    gemini_pro: 0,
    gemini_flash: 1,
    gemini_image: 2,
    claude: 3,
    other: 4,
  }
  var AUTO_GROUP_GEMINI_PRO_ID_SET = {
    "model_placeholder_m7": true,
    "model_placeholder_m8": true,
    "model_placeholder_m36": true,
    "model_placeholder_m37": true,
  }
  var AUTO_GROUP_GEMINI_FLASH_ID_SET = {
    "model_placeholder_m18": true,
  }
  var AUTO_GROUP_GEMINI_IMAGE_ID_SET = {
    "model_placeholder_m9": true,
  }
  var AUTO_GROUP_CLAUDE_ID_SET = {
    "model_claude_4_5_sonnet": true,
    "model_claude_4_5_sonnet_thinking": true,
    "model_placeholder_m12": true,
    "model_placeholder_m26": true,
    "model_placeholder_m35": true,
    "model_openai_gpt_oss_120b_medium": true,
  }
  var AUTO_GROUP_GEMINI_PRO_ID_PATTERN = /^gemini-\d+(?:\.\d+)?-pro-(high|low)(?:-|$)/
  var AUTO_GROUP_GEMINI_FLASH_ID_PATTERN = /^gemini-\d+(?:\.\d+)?-flash(?:-|$)/
  var AUTO_GROUP_GEMINI_IMAGE_ID_PATTERN = /^gemini-\d+(?:\.\d+)?-pro-image(?:-|$)/
  var AUTO_GROUP_GEMINI_PRO_LABEL_PATTERN = /^gemini \d+(?:\.\d+)? pro(?: \((high|low)\)| (high|low))\b/
  var AUTO_GROUP_GEMINI_FLASH_LABEL_PATTERN = /^gemini \d+(?:\.\d+)? flash\b/
  var AUTO_GROUP_GEMINI_IMAGE_LABEL_PATTERN = /^gemini \d+(?:\.\d+)? pro image\b/

  function readVarint(s, pos) {
    var value = 0
    var shift = 0
    while (pos < s.length) {
      var b = s.charCodeAt(pos++)
      value += (b & 0x7f) * Math.pow(2, shift)
      if ((b & 0x80) === 0) return { value: value, pos: pos }
      shift += 7
    }
    return null
  }

  function readFields(s) {
    var fields = {}
    var pos = 0
    while (pos < s.length) {
      var tag = readVarint(s, pos)
      if (!tag) break
      pos = tag.pos
      var fieldNum = Math.floor(tag.value / 8)
      var wireType = tag.value % 8
      if (wireType === 0) {
        var value = readVarint(s, pos)
        if (!value) break
        fields[fieldNum] = { type: 0, value: value.value }
        pos = value.pos
      } else if (wireType === 2) {
        var length = readVarint(s, pos)
        if (!length) break
        pos = length.pos
        fields[fieldNum] = { type: 2, data: s.substring(pos, pos + length.value) }
        pos += length.value
      } else {
        break
      }
    }
    return fields
  }

  function stateDbPath(ctx) {
    if (ctx.app.platform === "windows") return "~/AppData/Roaming/Antigravity/User/globalStorage/state.vscdb"
    if (ctx.app.platform === "linux") return "~/.config/Antigravity/User/globalStorage/state.vscdb"
    return "~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb"
  }

  function lsProcessName(ctx) {
    if (ctx.app.platform === "windows") return "language_server_windows"
    if (ctx.app.platform === "linux") return "language_server_linux"
    return "language_server_macos"
  }

  function lsOsName(ctx) {
    if (ctx.app.platform === "windows") return "windows"
    if (ctx.app.platform === "linux") return "linux"
    return "macos"
  }

  function loadApiKey(ctx) {
    try {
      var rows = ctx.host.sqlite.query(
        stateDbPath(ctx),
        "SELECT value FROM ItemTable WHERE key = 'antigravityAuthStatus' LIMIT 1"
      )
      var parsed = ctx.util.tryParseJson(rows)
      if (!parsed || !parsed.length || !parsed[0].value) return null
      var auth = ctx.util.tryParseJson(parsed[0].value)
      return auth && auth.apiKey ? auth.apiKey : null
    } catch (e) {
      ctx.host.log.warn("failed to read auth from antigravity DB: " + String(e))
      return null
    }
  }

  function loadProtoTokens(ctx) {
    try {
      var rows = ctx.host.sqlite.query(
        stateDbPath(ctx),
        "SELECT value FROM ItemTable WHERE key = 'jetskiStateSync.agentManagerInitState' LIMIT 1"
      )
      var parsed = ctx.util.tryParseJson(rows)
      if (!parsed || !parsed.length || !parsed[0].value) return null
      var raw = ctx.base64.decode(parsed[0].value)
      var outer = readFields(raw)
      if (!outer[6] || outer[6].type !== 2) return null
      var inner = readFields(outer[6].data)
      var accessToken = inner[1] && inner[1].type === 2 ? inner[1].data : null
      var refreshToken = inner[3] && inner[3].type === 2 ? inner[3].data : null
      var expirySeconds = null
      if (inner[4] && inner[4].type === 2) {
        var ts = readFields(inner[4].data)
        if (ts[1] && ts[1].type === 0) expirySeconds = ts[1].value
      }
      if (!accessToken) return null
      return { accessToken: accessToken, refreshToken: refreshToken, expirySeconds: expirySeconds }
    } catch (e) {
      ctx.host.log.warn("failed to read proto tokens from antigravity DB: " + String(e))
      return null
    }
  }

  function loadCachedToken(ctx) {
    var path = ctx.app.pluginDataDir + "/auth.json"
    try {
      if (!ctx.host.fs.exists(path)) return null
      var data = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      if (!data || !data.accessToken || !data.expiresAtMs) return null
      if (data.expiresAtMs <= Date.now()) return null
      return data.accessToken
    } catch (e) {
      ctx.host.log.warn("failed to read cached token: " + String(e))
      return null
    }
  }

  function cacheToken(ctx, accessToken, expiresInSeconds) {
    try {
      ctx.host.fs.writeText(ctx.app.pluginDataDir + "/auth.json", JSON.stringify({
        accessToken: accessToken,
        expiresAtMs: Date.now() + (expiresInSeconds || 3600) * 1000,
      }))
    } catch (e) {
      ctx.host.log.warn("failed to cache refreshed token: " + String(e))
    }
  }

  function refreshAccessToken(ctx, refreshTokenValue) {
    if (!refreshTokenValue) return null
    try {
      var resp = ctx.host.http.request({
        method: "POST",
        url: GOOGLE_OAUTH_URL,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        bodyText:
          "client_id=" + encodeURIComponent(GOOGLE_CLIENT_ID) +
          "&client_secret=" + encodeURIComponent(GOOGLE_CLIENT_SECRET) +
          "&refresh_token=" + encodeURIComponent(refreshTokenValue) +
          "&grant_type=refresh_token",
        timeoutMs: 15000,
      })
      if (resp.status < 200 || resp.status >= 300) return null
      var body = ctx.util.tryParseJson(resp.bodyText)
      if (!body || !body.access_token) return null
      cacheToken(ctx, body.access_token, typeof body.expires_in === "number" ? body.expires_in : 3600)
      return body.access_token
    } catch (e) {
      ctx.host.log.warn("Google OAuth refresh failed: " + String(e))
      return null
    }
  }

  function discoverLs(ctx) {
    return ctx.host.ls.discover({
      processName: lsProcessName(ctx),
      markers: ["antigravity"],
      csrfFlag: "--csrf_token",
      portFlag: "--extension_server_port",
    })
  }

  function lsCandidates(discovery) {
    var candidates = []
    var ports = discovery.ports || []
    for (var i = 0; i < ports.length; i++) {
      candidates.push({ port: ports[i], scheme: "https", kind: "port" })
      candidates.push({ port: ports[i], scheme: "http", kind: "port" })
    }
    if (discovery.extensionPort) {
      candidates.push({ port: discovery.extensionPort, scheme: "http", kind: "extensionPort" })
      candidates.push({ port: discovery.extensionPort, scheme: "https", kind: "extensionPort" })
    }
    return candidates
  }

  function callLs(ctx, port, scheme, csrf, method, body) {
    var resp = ctx.host.http.request({
      method: "POST",
      url: scheme + "://127.0.0.1:" + port + "/" + LS_SERVICE + "/" + method,
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        "x-codeium-csrf-token": csrf,
      },
      bodyText: JSON.stringify(body || {}),
      timeoutMs: 10000,
      dangerouslyIgnoreTls: scheme === "https",
    })
    if (resp.status < 200 || resp.status >= 300) return null
    return ctx.util.tryParseJson(resp.bodyText)
  }

  function parseFraction(value) {
    if (typeof value !== "number" || !isFinite(value) || value < 0 || value > 1) return undefined
    return value
  }

  function parseResetTime(value) {
    if (typeof value !== "string") return undefined
    var trimmed = value.trim()
    if (!trimmed) return undefined
    return isFinite(Date.parse(trimmed)) ? trimmed : undefined
  }

  function normalizeMatchText(value) {
    return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  }

  function resolveFamily(modelId, label) {
    var id = String(modelId || "").trim().toLowerCase()
    var text = normalizeMatchText(label || modelId)
    if (AUTO_GROUP_GEMINI_IMAGE_ID_SET[id] || AUTO_GROUP_GEMINI_IMAGE_ID_PATTERN.test(id) || AUTO_GROUP_GEMINI_IMAGE_LABEL_PATTERN.test(text)) return "gemini_image"
    if (AUTO_GROUP_GEMINI_PRO_ID_SET[id] || AUTO_GROUP_GEMINI_PRO_ID_PATTERN.test(id) || AUTO_GROUP_GEMINI_PRO_LABEL_PATTERN.test(text)) return "gemini_pro"
    if (AUTO_GROUP_GEMINI_FLASH_ID_SET[id] || AUTO_GROUP_GEMINI_FLASH_ID_PATTERN.test(id) || AUTO_GROUP_GEMINI_FLASH_LABEL_PATTERN.test(text)) return "gemini_flash"
    if (AUTO_GROUP_CLAUDE_ID_SET[id] || id.indexOf("claude-") === 0 || id.indexOf("model_claude") === 0 || text.indexOf("claude ") === 0) return "claude"
    if (text.indexOf("gemini") !== -1 && text.indexOf("image") !== -1) return "gemini_image"
    if (text.indexOf("gemini") !== -1 && text.indexOf("pro") !== -1) return "gemini_pro"
    if (text.indexOf("gemini") !== -1 && text.indexOf("flash") !== -1) return "gemini_flash"
    if (text.indexOf("claude") !== -1 || text.indexOf("gpt-oss") !== -1) return "claude"
    return "other"
  }

  function parseLabelOrderFromSorts(sorts, labelField) {
    var map = {}
    if (!sorts || !sorts.length) return map
    var groups = sorts[0] && sorts[0].groups
    if (!groups) return map
    var order = 0
    for (var i = 0; i < groups.length; i++) {
      var labels = groups[i] && groups[i][labelField]
      if (!labels) continue
      for (var j = 0; j < labels.length; j++) {
        var key = String(labels[j] || "")
        if (!key || map[key] !== undefined) continue
        map[key] = order++
      }
    }
    return map
  }

  function parseModelRecords(items, orderMap, orderKey, modelIdKey) {
    var records = []
    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      var label = typeof item.label === "string" ? item.label.trim() : typeof item.displayName === "string" ? item.displayName.trim() : ""
      if (!label) continue
      var modelId = modelIdKey(item, i)
      if (BLACKLISTED_MODEL_IDS[modelId]) continue
      var quotaInfo = item.quotaInfo || {}
      records.push({
        label: label,
        modelId: modelId,
        family: resolveFamily(modelId, label),
        remainingFraction: parseFraction(quotaInfo.remainingFraction),
        resetTime: parseResetTime(quotaInfo.resetTime),
        order: orderMap[orderKey(item)] !== undefined ? orderMap[orderKey(item)] : i,
      })
    }
    return records
  }

  function chooseFamilyQuota(models) {
    var byFingerprint = {}
    for (var i = 0; i < models.length; i++) {
      var model = models[i]
      if (model.remainingFraction === undefined) continue
      var fingerprint = model.remainingFraction.toFixed(6) + "|" + (model.resetTime || "")
      if (!byFingerprint[fingerprint]) {
        byFingerprint[fingerprint] = {
          count: 0,
          firstOrder: model.order,
          remainingFraction: model.remainingFraction,
          resetTime: model.resetTime,
        }
      }
      byFingerprint[fingerprint].count += 1
      if (model.order < byFingerprint[fingerprint].firstOrder) byFingerprint[fingerprint].firstOrder = model.order
    }
    var best = null
    var keys = Object.keys(byFingerprint)
    for (var j = 0; j < keys.length; j++) {
      var candidate = byFingerprint[keys[j]]
      if (!best || candidate.count > best.count || (candidate.count === best.count && candidate.firstOrder < best.firstOrder)) {
        best = candidate
      }
    }
    return best
  }

  function buildGroupedLines(ctx, models) {
    var byFamily = {}
    for (var i = 0; i < models.length; i++) {
      var model = models[i]
      if (model.remainingFraction === undefined) continue
      if (!byFamily[model.family]) byFamily[model.family] = []
      byFamily[model.family].push(model)
    }

    var groups = []
    var families = Object.keys(byFamily)
    for (var j = 0; j < families.length; j++) {
      var family = families[j]
      var quota = chooseFamilyQuota(byFamily[family])
      if (!quota) continue
      groups.push({
        label: FAMILY_LABELS[family] || FAMILY_LABELS.other,
        remainingFraction: quota.remainingFraction,
        resetTime: quota.resetTime,
        order: quota.firstOrder,
        priority: FAMILY_PRIORITY[family] !== undefined ? FAMILY_PRIORITY[family] : FAMILY_PRIORITY.other,
      })
    }

    groups.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.label.localeCompare(b.label)
    })

    var lines = []
    for (var k = 0; k < groups.length; k++) {
      lines.push(ctx.line.progress({
        label: groups[k].label,
        used: Math.round((1 - groups[k].remainingFraction) * 100),
        limit: 100,
        format: { kind: "percent" },
        resetsAt: groups[k].resetTime,
        periodDurationMs: QUOTA_PERIOD_MS,
      }))
    }
    return lines
  }

  function hasUsableQuota(models) {
    for (var i = 0; i < models.length; i++) {
      if (models[i].remainingFraction !== undefined) return true
    }
    return false
  }

  function unavailableLines(ctx) {
    return [ctx.line.badge({ label: "Status", text: "Quota unavailable", color: "#a3a3a3" })]
  }

  function parseLsResult(data) {
    var hasUserStatus = !!(data && data.userStatus)
    var container = hasUserStatus ? data.userStatus : data
    if (!container) return { plan: null, models: [] }
    var cascade = hasUserStatus ? (container.cascadeModelConfigData || {}) : container
    var configs = cascade.clientModelConfigs || []
    var orderMap = parseLabelOrderFromSorts(cascade.clientModelSorts || [], "modelLabels")
    var planInfo = hasUserStatus ? ((container.planStatus || {}).planInfo || {}) : {}
    return {
      plan: planInfo.planName || null,
      models: parseModelRecords(
        configs,
        orderMap,
        function (item) { return item.label },
        function (item) { return item.modelOrAlias && item.modelOrAlias.model ? item.modelOrAlias.model : String(item.label || "") }
      ),
    }
  }

  function resolveCloudCodeOrderedKeys(data) {
    var models = data && data.models
    if (!models || typeof models !== "object") return []
    var order = []
    var added = {}
    var sorts = data.agentModelSorts || []
    for (var i = 0; i < sorts.length; i++) {
      var groups = sorts[i] && sorts[i].groups
      if (!groups) continue
      for (var j = 0; j < groups.length; j++) {
        var modelIds = groups[j] && groups[j].modelIds
        if (!modelIds) continue
        for (var k = 0; k < modelIds.length; k++) {
          var modelKey = modelIds[k]
          if (!models[modelKey] || added[modelKey]) continue
          added[modelKey] = true
          order.push(modelKey)
        }
      }
    }
    if (models[EXTRA_IMAGE_MODEL_KEY] && !added[EXTRA_IMAGE_MODEL_KEY]) {
      added[EXTRA_IMAGE_MODEL_KEY] = true
      order.push(EXTRA_IMAGE_MODEL_KEY)
    }
    var keys = Object.keys(models)
    for (var x = 0; x < keys.length; x++) {
      var key = keys[x]
      if (added[key]) continue
      if (models[key] && models[key].model === EXTRA_IMAGE_MODEL_ID) {
        added[key] = true
        order.push(key)
      }
    }
    for (var y = 0; y < keys.length; y++) {
      if (!added[keys[y]]) order.push(keys[y])
    }
    return order
  }

  function parseCloudCodeModels(data) {
    var models = data && data.models
    if (!models || typeof models !== "object") return []
    var orderedKeys = resolveCloudCodeOrderedKeys(data)
    var orderedItems = []
    for (var i = 0; i < orderedKeys.length; i++) {
      var key = orderedKeys[i]
      var item = models[key]
      if (!item || typeof item !== "object" || item.isInternal) continue
      if (typeof item.displayName !== "string" || !item.displayName.trim()) continue
      orderedItems.push({
        key: key,
        displayName: item.displayName,
        model: item.model || key,
        quotaInfo: item.quotaInfo || {},
      })
    }
    return parseModelRecords(
      orderedItems,
      {},
      function (item) { return item.key },
      function (item) { return item.model }
    )
  }

  function probeLs(ctx, apiKey) {
    var discovery = discoverLs(ctx)
    if (!discovery) return null

    var metadata = { ideName: "antigravity", extensionName: "antigravity", ideVersion: "unknown", locale: "en" }
    if (apiKey) metadata.apiKey = apiKey

    var candidates = lsCandidates(discovery)
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i]
      var data = null
      try {
        data = callLs(ctx, candidate.port, candidate.scheme, discovery.csrf, "GetUserStatus", { metadata: metadata })
      } catch (e) {
        ctx.host.log.warn(
          "GetUserStatus threw on " +
            candidate.kind +
            " " +
            candidate.scheme +
            "://" +
            candidate.port +
            ": " +
            String(e)
        )
      }
      if (!(data && data.userStatus)) {
        try {
          data = callLs(ctx, candidate.port, candidate.scheme, discovery.csrf, "GetCommandModelConfigs", { metadata: metadata })
        } catch (e) {
          ctx.host.log.warn(
            "GetCommandModelConfigs threw on " +
              candidate.kind +
              " " +
              candidate.scheme +
              "://" +
              candidate.port +
              ": " +
              String(e)
          )
        }
      }
      if (!data) continue
      var parsed = parseLsResult(data)
      if (parsed.models.length > 0 || parsed.plan) return parsed
    }
    return null
  }

  function requestCloudCode(ctx, token) {
    for (var i = 0; i < CLOUD_CODE_URLS.length; i++) {
      try {
        var resp = ctx.host.http.request({
          method: "POST",
          url: CLOUD_CODE_URLS[i] + FETCH_MODELS_PATH,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "User-Agent": "antigravity" },
          bodyText: "{}",
          timeoutMs: 15000,
        })
        if (ctx.util.isAuthStatus(resp.status)) return { authFailed: true }
        if (resp.status >= 200 && resp.status < 300) return ctx.util.tryParseJson(resp.bodyText)
      } catch (e) {
        ctx.host.log.warn("Cloud Code request failed (" + CLOUD_CODE_URLS[i] + "): " + String(e))
      }
    }
    return null
  }

  function probe(ctx) {
    var apiKey = loadApiKey(ctx)
    var proto = loadProtoTokens(ctx)
    var ls = probeLs(ctx, apiKey)
    if (ls && hasUsableQuota(ls.models)) return { plan: ls.plan, lines: buildGroupedLines(ctx, ls.models) }

    var tokens = []
    if (proto && proto.accessToken && (!proto.expirySeconds || proto.expirySeconds > Math.floor(Date.now() / 1000))) tokens.push(proto.accessToken)
    var cached = loadCachedToken(ctx)
    if (cached && cached !== (proto && proto.accessToken)) tokens.push(cached)
    if (apiKey && apiKey !== (proto && proto.accessToken) && apiKey !== cached) tokens.push(apiKey)

    var ccData = null
    for (var i = 0; i < tokens.length; i++) {
      ccData = requestCloudCode(ctx, tokens[i])
      if (ccData && !ccData.authFailed) break
      ccData = null
    }
    if (!ccData && proto && proto.refreshToken) {
      var refreshed = refreshAccessToken(ctx, proto.refreshToken)
      if (refreshed) ccData = requestCloudCode(ctx, refreshed)
    }
    if (ccData && !ccData.authFailed) {
      var ccModels = parseCloudCodeModels(ccData)
      if (hasUsableQuota(ccModels)) return { plan: ls ? ls.plan : null, lines: buildGroupedLines(ctx, ccModels) }
      return { plan: ls ? ls.plan : null, lines: unavailableLines(ctx) }
    }

    if (ls && (ls.models.length > 0 || ls.plan)) return { plan: ls.plan, lines: unavailableLines(ctx) }
    throw "Start Antigravity and try again."
  }

  globalThis.__openusage_plugin = { id: "antigravity", probe: probe }
})()
