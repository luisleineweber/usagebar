(function () {
  const KEYCHAIN_SERVICE = "OpenUsage-copilot";
  const GH_KEYCHAIN_SERVICE = "gh:github.com";
  const GH_HOST = "github.com";
  const USAGE_URL = "https://api.github.com/copilot_internal/user";
  const WINDOWS_GH_HOSTS_PATH = "~/AppData/Roaming/GitHub CLI/hosts.yml";
  const UNIX_GH_HOSTS_PATH = "~/.config/gh/hosts.yml";

  function readJson(ctx, path) {
    try {
      if (!ctx.host.fs.exists(path)) return null;
      const text = ctx.host.fs.readText(path);
      return ctx.util.tryParseJson(text);
    } catch (e) {
      ctx.host.log.warn("readJson failed for " + path + ": " + String(e));
      return null;
    }
  }

  function writeJson(ctx, path, value) {
    try {
      ctx.host.fs.writeText(path, JSON.stringify(value));
    } catch (e) {
      ctx.host.log.warn("writeJson failed for " + path + ": " + String(e));
    }
  }

  function saveToken(ctx, token, login) {
    const payload = login ? { token: token, login: login } : { token: token };
    try {
      ctx.host.keychain.writeGenericPassword(
        KEYCHAIN_SERVICE,
        JSON.stringify(payload),
      );
    } catch (e) {
      ctx.host.log.warn("keychain write failed: " + String(e));
    }
    writeJson(ctx, ctx.app.pluginDataDir + "/auth.json", payload);
  }

  function clearCachedToken(ctx) {
    try {
      ctx.host.keychain.deleteGenericPassword(KEYCHAIN_SERVICE);
    } catch (e) {
      ctx.host.log.info("keychain delete failed: " + String(e));
    }
    writeJson(ctx, ctx.app.pluginDataDir + "/auth.json", null);
  }

  function shouldUseCachedToken(activeLogin, payload) {
    if (!activeLogin) return true;
    const cachedLogin =
      payload && typeof payload.login === "string" && payload.login.trim()
        ? payload.login.trim()
        : null;
    if (!cachedLogin) return false;
    return cachedLogin === activeLogin;
  }

  function loadTokenFromKeychain(ctx, activeLogin) {
    try {
      const raw = ctx.host.keychain.readGenericPassword(KEYCHAIN_SERVICE);
      if (raw) {
        const parsed = ctx.util.tryParseJson(raw);
        if (parsed && parsed.token) {
          if (!shouldUseCachedToken(activeLogin, parsed)) {
            ctx.host.log.info("cached token ignored because active gh account changed");
            return null;
          }
          ctx.host.log.info("token loaded from OpenUsage keychain");
          return { token: parsed.token, source: "keychain", login: parsed.login || null };
        }
      }
    } catch (e) {
      ctx.host.log.info("OpenUsage keychain read failed: " + String(e));
    }
    return null;
  }

  function joinPath(base, leaf) {
    return String(base || "").replace(/[\\/]+$/, "") + "/" + leaf;
  }

  function getGhHostsPaths(ctx) {
    const configuredDir = ctx.host.env.get("GH_CONFIG_DIR");
    const paths = [];
    if (configuredDir) paths.push(joinPath(configuredDir, "hosts.yml"));
    paths.push(ctx.app.platform === "windows" ? WINDOWS_GH_HOSTS_PATH : UNIX_GH_HOSTS_PATH);
    if (ctx.app.platform === "windows") paths.push(UNIX_GH_HOSTS_PATH);
    return paths.filter((value, index, all) => value && all.indexOf(value) === index);
  }

  function parseGhActiveLogin(text, host) {
    if (typeof text !== "string" || !text.trim()) return null;
    const lines = text.split(/\r?\n/);
    let inHost = false;
    let hostIndent = -1;
    let inUsers = false;
    let usersIndent = -1;
    const users = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.indexOf("#") === 0) continue;
      const indent = line.length - line.trimStart().length;

      if (!inHost) {
        if (trimmed === host + ":") {
          inHost = true;
          hostIndent = indent;
        }
        continue;
      }

      if (indent <= hostIndent && /:\s*$/.test(trimmed)) break;

      if (trimmed.indexOf("user:") === 0) {
        const login = trimmed.slice("user:".length).trim();
        if (login) return login;
      }

      if (trimmed === "users:") {
        inUsers = true;
        usersIndent = indent;
        continue;
      }

      if (inUsers) {
        if (indent <= usersIndent) {
          inUsers = false;
          continue;
        }
        if (/^[^:#]+:\s*$/.test(trimmed)) {
          users.push(trimmed.slice(0, -1).trim());
        }
      }
    }

    return users.length === 1 ? users[0] : null;
  }

  function loadGhActiveLogin(ctx) {
    const paths = getGhHostsPaths(ctx);
    for (let i = 0; i < paths.length; i += 1) {
      const path = paths[i];
      if (!ctx.host.fs.exists(path)) continue;
      try {
        const login = parseGhActiveLogin(ctx.host.fs.readText(path), GH_HOST);
        if (login) return login;
      } catch (e) {
        ctx.host.log.info("gh hosts read failed: " + String(e));
      }
    }
    return null;
  }

  function decodeGhToken(ctx, raw) {
    let token = raw;
    if (
      typeof token === "string" &&
      token.indexOf("go-keyring-base64:") === 0
    ) {
      token = ctx.base64.decode(token.slice("go-keyring-base64:".length));
    }
    return token;
  }

  function loadTokenFromGhCliAccount(ctx, login) {
    if (!login || typeof ctx.host.keychain.readGenericPasswordForAccount !== "function") {
      return null;
    }
    try {
      const raw = ctx.host.keychain.readGenericPasswordForAccount(
        GH_KEYCHAIN_SERVICE,
        login,
      );
      const token = decodeGhToken(ctx, raw);
      if (token) {
        ctx.host.log.info("token loaded from gh CLI keychain for active account");
        return { token: token, source: "gh-cli", login: login };
      }
    } catch (e) {
      ctx.host.log.info("gh CLI account read failed: " + String(e));
    }
    return null;
  }

  function loadTokenFromGhCli(ctx, activeLogin) {
    const activeAccountToken = loadTokenFromGhCliAccount(ctx, activeLogin);
    if (activeAccountToken) return activeAccountToken;

    try {
      const raw = ctx.host.keychain.readGenericPassword(GH_KEYCHAIN_SERVICE);
      if (raw) {
        const token = decodeGhToken(ctx, raw);
        if (token) {
          ctx.host.log.info("token loaded from gh CLI keychain");
          return { token: token, source: "gh-cli", login: activeLogin || null };
        }
      }
    } catch (e) {
      ctx.host.log.info("gh CLI keychain read failed: " + String(e));
    }
    return null;
  }

  function loadTokenFromStateFile(ctx, activeLogin) {
    const data = readJson(ctx, ctx.app.pluginDataDir + "/auth.json");
    if (data && data.token) {
      if (!shouldUseCachedToken(activeLogin, data)) {
        ctx.host.log.info("state token ignored because active gh account changed");
        return null;
      }
      ctx.host.log.info("token loaded from state file");
      return { token: data.token, source: "state", login: data.login || null };
    }
    return null;
  }

  function loadToken(ctx, activeLogin) {
    return (
      loadTokenFromKeychain(ctx, activeLogin) ||
      loadTokenFromGhCli(ctx, activeLogin) ||
      loadTokenFromStateFile(ctx, activeLogin)
    );
  }

  function fetchUsage(ctx, token) {
    return ctx.util.request({
      method: "GET",
      url: USAGE_URL,
      headers: {
        Authorization: "token " + token,
        Accept: "application/json",
        "Editor-Version": "vscode/1.96.2",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "X-Github-Api-Version": "2025-04-01",
      },
      timeoutMs: 10000,
    });
  }

  function makeProgressLine(ctx, label, snapshot, resetDate) {
    if (!snapshot || typeof snapshot.percent_remaining !== "number")
      return null;
    const usedPercent = Math.min(100, Math.max(0, 100 - snapshot.percent_remaining));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  function makeLimitedProgressLine(ctx, label, remaining, total, resetDate) {
    if (typeof remaining !== "number" || typeof total !== "number" || total <= 0)
      return null;
    const used = total - remaining;
    const usedPercent = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  function probe(ctx) {
    const activeLogin = loadGhActiveLogin(ctx);
    const cred = loadToken(ctx, activeLogin);
    if (!cred) {
      throw "Not logged in. Run `gh auth login` first.";
    }

    let token = cred.token;
    let source = cred.source;

    let resp;
    try {
      resp = fetchUsage(ctx, token);
    } catch (e) {
      ctx.host.log.error("usage request exception: " + String(e));
      throw "Usage request failed. Check your connection.";
    }

    if (resp.status === 401 || resp.status === 403) {
      // If cached token is stale, clear it and try fallback sources
      if (source === "keychain") {
        ctx.host.log.info("cached token invalid, trying fallback sources");
        clearCachedToken(ctx);
        const fallback = loadTokenFromGhCli(ctx, activeLogin);
        if (fallback) {
          try {
            resp = fetchUsage(ctx, fallback.token);
          } catch (e) {
            ctx.host.log.error("fallback usage request exception: " + String(e));
            throw "Usage request failed. Check your connection.";
          }
          if (resp.status >= 200 && resp.status < 300) {
            // Fallback worked, persist the new token
            saveToken(ctx, fallback.token, fallback.login);
            token = fallback.token;
            source = fallback.source;
          }
        }
      }
      // Still failing after retry
      if (resp.status === 401 || resp.status === 403) {
        throw "Token invalid. Run `gh auth login` to re-authenticate.";
      }
    }

    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.error("usage returned error: status=" + resp.status);
      throw (
        "Usage request failed (HTTP " +
        String(resp.status) +
        "). Try again later."
      );
    }

    // Persist gh-cli token to OpenUsage keychain for future use
    if (source === "gh-cli") {
      saveToken(ctx, token, cred.login);
    }

    const data = ctx.util.tryParseJson(resp.bodyText);
    if (data === null) {
      throw "Usage response invalid. Try again later.";
    }

    ctx.host.log.info("usage fetch succeeded");

    const lines = [];
    let plan = null;
    if (data.copilot_plan) {
      plan = ctx.fmt.planLabel(data.copilot_plan);
    }

    // Paid tier: quota_snapshots
    const snapshots = data.quota_snapshots;
    if (snapshots) {
      const premiumLine = makeProgressLine(
        ctx,
        "Premium",
        snapshots.premium_interactions,
        data.quota_reset_date,
      );
      if (premiumLine) lines.push(premiumLine);

      const chatLine = makeProgressLine(
        ctx,
        "Chat",
        snapshots.chat,
        data.quota_reset_date,
      );
      if (chatLine) lines.push(chatLine);
    }

    // Free tier: limited_user_quotas
    if (data.limited_user_quotas && data.monthly_quotas) {
      const lq = data.limited_user_quotas;
      const mq = data.monthly_quotas;
      const resetDate = data.limited_user_reset_date;

      const chatLine = makeLimitedProgressLine(ctx, "Chat", lq.chat, mq.chat, resetDate);
      if (chatLine) lines.push(chatLine);

      const completionsLine = makeLimitedProgressLine(ctx, "Completions", lq.completions, mq.completions, resetDate);
      if (completionsLine) lines.push(completionsLine);
    }

    if (lines.length === 0) {
      lines.push(
        ctx.line.badge({
          label: "Status",
          text: "No usage data",
          color: "#a3a3a3",
        }),
      );
    }

    return { plan: plan, lines: lines };
  }

  globalThis.__openusage_plugin = { id: "copilot", probe };
})();
