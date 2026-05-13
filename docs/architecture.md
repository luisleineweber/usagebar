# UsageBar — Architecture Guide

> **Audience:** contributors and anyone debugging or extending the app.
> **Stack:** Tauri v2 · Rust · React 19 · TypeScript · Vite · Tailwind v4 · Zustand · Vitest

---

## High-level overview

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri Window (WebView)                                      │
│                                                             │
│   React frontend                                            │
│   ├── App.tsx (root orchestrator)                           │
│   ├── AppShell (panel chrome, context menu, SideNav)        │
│   ├── AppContent (route switcher: overview ↔ detail)        │
│   ├── OverviewPage / ProviderDetailPage                     │
│   ├── ProviderCard / MetricLineRenderer                     │
│   └── Settings Window (separate Tauri window)              │
│                                                             │
│   Zustand stores (3)                                        │
│   ├── useAppPluginStore  — plugin meta + settings + configs │
│   ├── useAppPreferencesStore — theme, display, shortcuts    │
│   └── useAppUiStore  — active view, about-modal flag        │
│                                                             │
│   Plugin engine (JS, runs inside WebView)                  │
│   └── Plugins loaded from bundled resource files           │
└─────────────────────────────────────────────────────────────┘
         │  Tauri IPC (invoke / listen)
┌────────▼──────────────────────────────────────────────────────┐
│  Rust host (src-tauri/)                                       │
│  ├── Tray icon + tray context menu                           │
│  ├── Panel window lifecycle (show / hide / resize)           │
│  ├── Settings window lifecycle                               │
│  ├── Plugin engine host APIs (HTTP fetch, SQLite, fs-read…) │
│  ├── Provider secret store (DPAPI-encrypted on Windows)      │
│  ├── Codex account store                                     │
│  └── Local HTTP API  127.0.0.1:6736                         │
└───────────────────────────────────────────────────────────────┘
```

---

## Zustand stores

Each store owns a single concern. They are **never** directly mutated from outside — only via their setter actions.

### `useAppPluginStore` (`src/stores/app-plugin-store.ts`)

| Field | Type | What it is |
|---|---|---|
| `pluginsMeta` | `PluginMeta[]` | Static manifest data loaded from each plugin's `plugin.json` |
| `pluginSettings` | `PluginSettings \| null` | User's ordered list + disabled set, persisted to `settings.json` |
| `providerConfigs` | `ProviderConfigs` | Per-provider auth config (source mode, workspace id, secret metadata) |

### `useAppPreferencesStore` (`src/stores/app-preferences-store.ts`)

Owns all display preferences: `themeMode`, `displayMode`, `resetTimerDisplayMode`, `menubarIconStyle`, `autoUpdateInterval`, `globalShortcut`, `startOnLogin`.

### `useAppUiStore` (`src/stores/app-ui-store.ts`)

Owns transient UI state: `activeView` (which provider is selected in the panel) and `showAbout` (About dialog flag).

---

## Data flow — from user action to display

### 1. Panel open / provider switch

```
User clicks a nav icon
  → SideNav calls onViewChange(pluginId)
  → useAppUiStore.setActiveView(pluginId)
  → AppContent re-renders, picks ProviderDetailPage
  → onPanelFocus() fires, triggers probe for that provider
  → useProbe.handleRetryPlugin(pluginId)
  → plugin engine executes plugin JS in the WebView sandbox
  → result stored in useProbe's pluginStates map
  → ProviderCard receives new data via DisplayPluginState
```

### 2. Plugin probe execution

```
startBatch(pluginIds)           // src/hooks/app/use-probe.ts
  → invoke("start_probe_batch") // Tauri IPC → Rust
  → Rust: plugin_engine executes plugin JS
  → JS plugin calls host API (http_fetch / sqlite_query / …)
  → Rust enforces capability allowlist before calling API
  → result returned via Tauri event: "probe-result:{pluginId}"
  → useProbeEvents listener picks it up
  → pluginStates[pluginId] = { data, loading: false }
  → ProviderCard re-renders with new lines
```

### 3. Settings change → tray icon update

```
User changes a display preference in Settings window
  → Settings window emits a custom Tauri event (display-preference-updated)
  → App.tsx listener in useEffect updates the Zustand store
  → scheduleTrayIconUpdate("settings", 0) debounces a tray redraw
  → useTrayIcon computes the new icon image
  → invoke("set_tray_icon") sends the icon to Rust
```

---

## Plugin system

### Plugin manifest (`plugin.json`)

Each plugin folder under `plugins/` contains:

```
plugins/claude/
  ├── plugin.json      # identity, capabilities, icon, display hints
  ├── index.js         # the plugin execution entry point
  └── icon.svg         # provider icon (must use currentColor)
```

**`plugin.json` key fields:**

```jsonc
{
  "id": "claude",
  "name": "Claude",
  "brandColor": "#D97757",
  "supportState": "supported",        // "supported" | "experimental" | "comingSoonOnWindows"
  "capabilities": ["http"],           // what host APIs the plugin may call
  "lines": [                          // skeleton hints for loading UI
    { "type": "progress", "label": "Session", "scope": "overview" },
    { "type": "progress", "label": "Weekly",  "scope": "overview" }
  ],
  "primaryCandidates": ["Session", "Weekly"]
}
```

### Plugin execution lifecycle

1. **Boot:** `useSettingsBootstrap` loads all `plugin.json` manifests → `pluginsMeta`.
2. **Bundle:** plugins are pre-copied to the Tauri resource bundle by `bun run bundle:plugins` — the resource path is what actually executes at runtime.
3. **Execute:** `startBatch(pluginIds)` invokes the Rust plugin host which evals `index.js` inside a sandboxed JS context.
4. **Output:** the plugin returns a `PluginOutput` object (or throws). The Rust host emits a `probe-result` event back to the WebView.
5. **Display:** the React frontend receives the event, updates `pluginStates`, and re-renders the relevant `ProviderCard`.

### `PluginOutput` shape (`src/lib/plugin-types.ts`)

```ts
type PluginOutput = {
  providerId: string
  displayName: string
  plan?: string            // e.g. "Plus", "Pro"
  lines: MetricLine[]      // array of text / badge / progress rows
  iconUrl: string
}
```

### `MetricLine` variants

| Variant | Purpose | Key fields |
|---|---|---|
| `"text"` | Simple key–value row | `label`, `value`, optional `color`, `subtitle` |
| `"badge"` | Labelled pill badge | `label`, `text`, optional `color` |
| `"progress"` | Bar with pace/reset logic | `label`, `used`, `limit`, `format`, `resetsAt?`, `periodDurationMs?` |

---

## How to add a new provider

1. **Create the plugin folder:**
   ```
   plugins/myprovider/
     plugin.json
     index.js
     icon.svg
   ```

2. **Fill in `plugin.json`** — copy from an existing similar provider (e.g. `kilo` for API-key providers).

3. **Write `index.js`** — the plugin must `export default async function run(host)` and return a `PluginOutput` (or throw on fatal errors). Use `host.httpFetch()` for API calls.

4. **Add a `ProviderSettingsDefinition`** in `src/lib/provider-settings.ts` — defines the Settings UI (auth mode, secret field, hints).

5. **Add provider docs** in `docs/providers/myprovider.md`.

6. **Bundle and test:**
   ```bash
   bun run bundle:plugins
   bun run tauri dev
   ```

7. **Audit** — check the redaction allowlist in `src-tauri/src/plugin_engine/host_api.rs` and confirm the capabilities in `plugin.json` are the minimum needed.

8. **Add a test** — at minimum, a snapshot test of the plugin output shape.

> See `docs/plugins/api.md` for the full plugin host API reference.

---

## Key file map

| Path | What lives there |
|---|---|
| `src/App.tsx` | Root orchestrator; wires all hooks, stores, and event listeners |
| `src/components/app/app-shell.tsx` | Panel chrome, context menu, tray panel layout |
| `src/components/app/app-content.tsx` | View switcher (overview ↔ provider detail), enter transition |
| `src/components/provider-card.tsx` | Provider card: header, error states, metric lines |
| `src/components/metric-line-renderer.tsx` | `MetricLineRenderer` + `PaceIndicator` — extracted from provider-card |
| `src/components/side-nav.tsx` | Left icon rail, drag-to-reorder (dnd-kit) |
| `src/components/panel-footer.tsx` | Version label, update flow, auto-refresh countdown |
| `src/components/settings/` | Settings window components (general pane, providers pane, detail) |
| `src/hooks/app/use-probe.ts` | Orchestrates plugin execution, auto-refresh, manual retry |
| `src/hooks/app/use-probe-state.ts` | Manages `pluginStates` map, batch lifecycle |
| `src/hooks/app/use-probe-events.ts` | Listens for `probe-result` Tauri events |
| `src/hooks/app/use-tray-icon.ts` | Computes and pushes tray icon on state changes |
| `src/hooks/app/use-settings-bootstrap.ts` | Loads all initial settings from disk on first render |
| `src/hooks/app/use-app-plugin-views.ts` | Derives `displayPlugins` + `navPlugins` from stores |
| `src/lib/settings.ts` | Types, defaults, load/save functions for user preferences |
| `src/lib/provider-settings.ts` | Per-provider auth config types + `ProviderSettingsDefinition` map |
| `src/lib/plugin-types.ts` | Shared plugin output types (`MetricLine`, `PluginOutput`, etc.) |
| `src/lib/pace-status.ts` | Pace math: `calculatePaceStatus`, `calculateDeficit` |
| `src-tauri/src/plugin_engine/` | Rust plugin host: execution, capability gating, host API handlers |
| `src-tauri/src/provider_secret_store.rs` | DPAPI-encrypted credential storage |
| `src-tauri/src/tray.rs` | Tray icon + context menu wiring |
| `plugins/` | Provider plugin source (one folder per provider) |

---

## Coding conventions

- **Error handling:** use explicit result types; `throw` is reserved for external I/O and React Query mutations.
- **Files:** stay under ~400 LOC; split into focused helpers when approaching the limit.
- **Stores:** setters only; no derived logic in stores — derive in hooks or `useMemo`.
- **IPC:** JS must use **camelCase** parameters (`{ batchId, pluginIds }`). Tauri auto-converts to Rust snake_case.
- **Tailwind:** use design tokens (`text-muted-foreground`, `bg-destructive/5`, etc.) over hardcoded colors.
- **Icons:** plugin SVGs must use `currentColor` for theme compatibility.
