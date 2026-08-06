use serde::Serialize;

#[cfg(not(test))]
use std::sync::Mutex;

pub(crate) struct ResolvedPluginSupport {
    pub(crate) support_state: &'static str,
    pub(crate) support_message: Option<String>,
    pub(crate) is_surfaced: bool,
    pub(crate) probe_supported: bool,
}

pub(crate) fn plugin_support_for_current_platform(
    manifest: &crate::plugin_engine::manifest::PluginManifest,
) -> ResolvedPluginSupport {
    if cfg!(target_os = "windows") {
        let windows = &manifest.platform_support.windows;
        let (support_state, probe_supported, default_message) = match windows.state {
            crate::plugin_engine::manifest::WindowsSupportState::Supported => {
                ("supported", true, None)
            }
            crate::plugin_engine::manifest::WindowsSupportState::Experimental => (
                "experimental",
                true,
                Some("Experimental on Windows.".to_string()),
            ),
            crate::plugin_engine::manifest::WindowsSupportState::Blocked => (
                "comingSoonOnWindows",
                false,
                Some("Coming soon on Windows.".to_string()),
            ),
        };

        return ResolvedPluginSupport {
            support_state,
            support_message: windows.message.clone().or(default_message),
            is_surfaced: windows.surfaced,
            probe_supported,
        };
    }

    ResolvedPluginSupport {
        support_state: "supported",
        support_message: None,
        is_surfaced: true,
        probe_supported: true,
    }
}

pub(crate) fn plugin_is_probe_supported(
    manifest: &crate::plugin_engine::manifest::PluginManifest,
) -> bool {
    plugin_support_for_current_platform(manifest).probe_supported
}

#[cfg(not(test))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub icon_url: String,
    pub icon_color_mode: crate::plugin_engine::manifest::IconColorMode,
    pub brand_color: Option<String>,
    pub default_plan: Option<String>,
    pub support_state: String,
    pub support_message: Option<String>,
    pub is_surfaced: bool,
    pub status_page_url: Option<String>,
    pub status: Option<PluginStatusDto>,
    pub lines: Vec<ManifestLineDto>,
    pub links: Vec<PluginLinkDto>,
    /// Ordered list of primary metric candidates (sorted by primaryOrder).
    /// Frontend picks the first one that exists in runtime data.
    pub primary_candidates: Vec<String>,
}

#[cfg(not(test))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLineDto {
    #[serde(rename = "type")]
    pub line_type: String,
    pub label: String,
    pub scope: String,
}

#[cfg(not(test))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLinkDto {
    pub label: String,
    pub url: String,
}

#[cfg(not(test))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStatusDto {
    pub kind: crate::plugin_engine::manifest::StatusSourceKind,
    pub endpoint: Option<String>,
    pub component_names: Vec<String>,
}

#[cfg(not(test))]
#[tauri::command]
pub(crate) fn list_plugins(state: tauri::State<'_, Mutex<crate::AppState>>) -> Vec<PluginMeta> {
    let plugins = {
        let locked = state.lock().expect("plugin state poisoned");
        locked.plugins.clone()
    };
    log::debug!("list_plugins: {} plugins", plugins.len());

    plugins
        .into_iter()
        .map(|plugin| {
            let mut candidates: Vec<_> = plugin
                .manifest
                .lines
                .iter()
                .filter(|line| line.line_type == "progress" && line.primary_order.is_some())
                .collect();
            candidates.sort_by_key(|line| line.primary_order.unwrap());
            let primary_candidates: Vec<String> =
                candidates.iter().map(|line| line.label.clone()).collect();

            let support = plugin_support_for_current_platform(&plugin.manifest);

            PluginMeta {
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                icon_url: plugin.icon_data_url,
                icon_color_mode: plugin.manifest.icon_color_mode,
                brand_color: plugin.manifest.brand_color,
                default_plan: plugin.manifest.default_plan,
                support_state: support.support_state.to_string(),
                support_message: support.support_message,
                is_surfaced: support.is_surfaced,
                status_page_url: plugin
                    .manifest
                    .links
                    .iter()
                    .find(|link| link.label.eq_ignore_ascii_case("status"))
                    .map(|link| link.url.clone()),
                status: plugin.manifest.status.map(|status| PluginStatusDto {
                    kind: status.kind,
                    endpoint: status.endpoint,
                    component_names: status.component_names,
                }),
                lines: plugin
                    .manifest
                    .lines
                    .iter()
                    .map(|line| ManifestLineDto {
                        line_type: line.line_type.clone(),
                        label: line.label.clone(),
                        scope: line.scope.clone(),
                    })
                    .collect(),
                links: plugin
                    .manifest
                    .links
                    .iter()
                    .map(|link| PluginLinkDto {
                        label: link.label.clone(),
                        url: link.url.clone(),
                    })
                    .collect(),
                primary_candidates,
            }
        })
        .collect()
}
