use crate::plugin_engine::host_api;
use crate::plugin_engine::manifest::{HostCapabilities, LoadedPlugin};
use crate::plugin_engine::runtime::ProviderInstanceRef;
use rquickjs::{Context, Function, Object, Runtime, Value};
use serde::Serialize;
use std::path::Path;
use std::time::{Duration, Instant};

const MAX_SETUP_CHECKS: usize = 32;
const MAX_SETUP_CHECK_ID_LENGTH: usize = 96;
const LOCAL_SCAN_MEMORY_LIMIT_BYTES: usize = 64 * 1024 * 1024;
const LOCAL_SCAN_STACK_LIMIT_BYTES: usize = 1024 * 1024;
const LOCAL_SCAN_EXECUTION_LIMIT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SetupDetectionState {
    Found,
    Missing,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetupDetection {
    pub id: String,
    pub state: SetupDetectionState,
}

/// Runs an optional plugin-local detector. The detector contract only accepts
/// opaque check ids and state values, so credential values cannot cross the
/// plugin/runtime boundary into the frontend.
pub(crate) fn run<'js>(
    plugin: &Object<'js>,
    probe_ctx: Value<'js>,
) -> Result<Option<Vec<SetupDetection>>, String> {
    let detect: Function = match plugin.get("detectSetup") {
        Ok(function) => function,
        Err(_) => return Ok(None),
    };

    let value: Value<'js> = detect
        .call((probe_ctx,))
        .map_err(|_| "setup detector failed".to_string())?;
    let value = if value.is_promise() {
        let promise = value
            .into_promise()
            .ok_or_else(|| "setup detector returned an invalid promise".to_string())?;
        promise
            .finish::<Value>()
            .map_err(|_| "setup detector promise failed".to_string())?
    } else {
        value
    };

    parse(value).map(Some)
}

/// Host APIs for a local setup scan. Network, browser, language-server, and ccusage access
/// stay off, and SQLite is read-only, so a scan cannot contact a provider or change state.
fn local_scan_capabilities(capabilities: &HostCapabilities) -> HostCapabilities {
    HostCapabilities {
        http: false,
        http_domains: Vec::new(),
        browser: false,
        ls: false,
        ccusage: false,
        sqlite_write: false,
        ..capabilities.clone()
    }
}

/// Runs only `detectSetup(ctx)` in a fresh sandbox, without the usage probe. This is the
/// operation behind the settings "Scan again" action.
pub(crate) fn detect_local(
    plugin: &LoadedPlugin,
    app_data_dir: &Path,
    app_version: &str,
    instance_ref: Option<&ProviderInstanceRef>,
) -> Result<Vec<SetupDetection>, String> {
    let deadline_at = Instant::now() + LOCAL_SCAN_EXECUTION_LIMIT;
    let runtime = Runtime::new().map_err(|_| "setup scan runtime failed".to_string())?;
    runtime.set_memory_limit(LOCAL_SCAN_MEMORY_LIMIT_BYTES);
    runtime.set_max_stack_size(LOCAL_SCAN_STACK_LIMIT_BYTES);
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline_at)));
    let context = Context::full(&runtime).map_err(|_| "setup scan context failed".to_string())?;
    let capabilities = local_scan_capabilities(&plugin.manifest.capabilities);

    context.with(|ctx| {
        host_api::inject_host_api_with_instance_and_cache(
            &ctx,
            &plugin.manifest.id,
            app_data_dir,
            app_version,
            None,
            &capabilities,
            instance_ref.cloned(),
            None,
        )
        .map_err(|_| "setup scan host api injection failed".to_string())?;
        host_api::inject_utils(&ctx)
            .map_err(|_| "setup scan utils injection failed".to_string())?;
        ctx.eval::<(), _>(plugin.entry_script.as_bytes())
            .map_err(|_| "setup scan script eval failed".to_string())?;

        let globals = ctx.globals();
        let plugin_obj: Object = globals
            .get("__openusage_plugin")
            .map_err(|_| "missing __openusage_plugin".to_string())?;
        let scan_ctx: Value = globals
            .get("__openusage_ctx")
            .map_err(|_| "missing setup scan context".to_string())?;
        let detection = run(&plugin_obj, scan_ctx)?;
        if Instant::now() >= deadline_at {
            return Err("setup scan timed out".to_string());
        }
        detection.ok_or_else(|| "plugin has no setup detector".to_string())
    })
}

fn parse(value: Value<'_>) -> Result<Vec<SetupDetection>, String> {
    let checks = value
        .into_array()
        .ok_or_else(|| "setup detector must return an array".to_string())?;
    if checks.len() > MAX_SETUP_CHECKS {
        return Err("setup detector returned too many checks".to_string());
    }

    let mut result = Vec::with_capacity(checks.len());
    let mut ids = std::collections::HashSet::new();
    for index in 0..checks.len() {
        let check: Object = checks
            .get(index)
            .map_err(|_| format!("invalid setup check at index {}", index))?;
        let id = check
            .get::<_, String>("id")
            .map_err(|_| format!("setup check at index {} has no id", index))?;
        let id = id.trim();
        if id.is_empty() || id.len() > MAX_SETUP_CHECK_ID_LENGTH {
            return Err(format!("setup check at index {} has an invalid id", index));
        }
        if !ids.insert(id.to_string()) {
            return Err(format!("setup detector returned duplicate id '{}'", id));
        }

        let state = match check
            .get::<_, String>("state")
            .map_err(|_| format!("setup check '{}' has no state", id))?
            .as_str()
        {
            "found" => SetupDetectionState::Found,
            "missing" => SetupDetectionState::Missing,
            "unavailable" => SetupDetectionState::Unavailable,
            _ => return Err(format!("setup check '{}' has an invalid state", id)),
        };

        result.push(SetupDetection {
            id: id.to_string(),
            state,
        });
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::{SetupDetectionState, detect_local, local_scan_capabilities, parse};
    use crate::plugin_engine::manifest::{
        HostCapabilities, IconColorMode, LoadedPlugin, PlatformSupport, PluginManifest,
    };
    use rquickjs::{Context, Runtime};

    fn scan_plugin(script: &str, capabilities: HostCapabilities) -> LoadedPlugin {
        LoadedPlugin {
            manifest: PluginManifest {
                schema_version: 1,
                id: "scan-test".to_string(),
                name: "Scan Test".to_string(),
                version: "0.0.0".to_string(),
                entry: "plugin.js".to_string(),
                icon: "icon.svg".to_string(),
                dark_icon: None,
                icon_color_mode: IconColorMode::default(),
                icon_aspect_ratio: None,
                brand_color: None,
                default_plan: None,
                lines: vec![],
                detail: None,
                links: vec![],
                status: None,
                platform_support: PlatformSupport::default(),
                capabilities,
                source_provenance: None,
            },
            plugin_dir: std::path::PathBuf::from("."),
            entry_script: script.to_string(),
            icon_data_url: String::new(),
            dark_icon_data_url: None,
        }
    }

    fn scan_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("usagebar-setup-scan-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn local_scan_capabilities_disable_network_and_writes() {
        let capabilities = local_scan_capabilities(&HostCapabilities {
            fs: true,
            http: true,
            http_domains: vec!["example.com".to_string()],
            browser: true,
            ls: true,
            ccusage: true,
            sqlite_read: true,
            sqlite_write: true,
            ..HostCapabilities::default()
        });
        assert!(capabilities.fs);
        assert!(capabilities.sqlite_read);
        assert!(!capabilities.http);
        assert!(capabilities.http_domains.is_empty());
        assert!(!capabilities.browser);
        assert!(!capabilities.ls);
        assert!(!capabilities.ccusage);
        assert!(!capabilities.sqlite_write);
    }

    #[test]
    fn detect_local_runs_only_the_detector_without_network_access() {
        let plugin = scan_plugin(
            r#"
            globalThis.__openusage_plugin = {
                detectSetup(ctx) {
                    return [{ id: "network", state: ctx.host.http ? "found" : "missing" }];
                },
                probe() {
                    throw "probe must not run during a setup scan";
                }
            };
            "#,
            HostCapabilities {
                http: true,
                ..HostCapabilities::default()
            },
        );

        let checks = detect_local(&plugin, &scan_dir(), "0.0.0", None).expect("checks");
        assert_eq!(checks.len(), 1);
        assert!(matches!(checks[0].state, SetupDetectionState::Missing));
    }

    #[test]
    fn detect_local_reports_a_plugin_without_a_detector() {
        let plugin = scan_plugin(
            "globalThis.__openusage_plugin = { probe() { return { lines: [] }; } };",
            HostCapabilities::default(),
        );
        assert!(detect_local(&plugin, &scan_dir(), "0.0.0", None).is_err());
    }

    #[test]
    fn parses_only_the_safe_setup_detection_shape() {
        let runtime = Runtime::new().expect("runtime");
        let context = Context::full(&runtime).expect("context");
        context.with(|ctx| {
            let value = ctx
                .eval::<rquickjs::Value, _>(
                    br#"[{ id: "kimi-cli", state: "found" }, { id: "api-key", state: "missing" }]"#,
                )
                .expect("value");
            let checks = parse(value).expect("checks");
            assert_eq!(checks.len(), 2);
            assert!(matches!(checks[0].state, SetupDetectionState::Found));
        });
    }

    #[test]
    fn rejects_duplicate_ids() {
        let runtime = Runtime::new().expect("runtime");
        let context = Context::full(&runtime).expect("context");
        context.with(|ctx| {
            let value = ctx
                .eval::<rquickjs::Value, _>(
                    br#"[{ id: "same", state: "found" }, { id: "same", state: "missing" }]"#,
                )
                .expect("value");
            assert!(parse(value).is_err());
        });
    }
}
