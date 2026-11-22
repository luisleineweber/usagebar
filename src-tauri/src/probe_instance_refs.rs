//! Resolves which provider instance each probe or setup scan runs for.
//!
//! The resolved instance ref is the key for the probe coordinator and the per-instance probe
//! lock. Plugins read `instanceId` trimmed and treat an empty value as the default account, so the
//! host normalizes it the same way. Otherwise `""`, `" "`, and an omitted id would be different
//! keys for the same plugin data, and two probes could write the same hold records at once.

use std::collections::HashMap;

use crate::plugin_engine::runtime::ProviderInstanceRef;

fn normalize_instance_id(instance_id: Option<String>) -> Option<String> {
    let instance_id = instance_id?;
    let trimmed = instance_id.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn resolve_instance_refs(
    app_data_dir: &std::path::Path,
    plugin_ids: &[String],
    requested: Option<Vec<ProviderInstanceRef>>,
) -> Vec<ProviderInstanceRef> {
    let requested_by_provider: HashMap<_, _> = requested
        .unwrap_or_default()
        .into_iter()
        .map(|instance| {
            let instance = ProviderInstanceRef {
                instance_id: normalize_instance_id(instance.instance_id),
                ..instance
            };
            (instance.provider_id.clone(), instance)
        })
        .collect();
    let selected_by_provider = load_selected_instance_ids(app_data_dir);

    plugin_ids
        .iter()
        .map(|provider_id| match requested_by_provider.get(provider_id) {
            Some(requested) if requested.instance_id.is_some() => requested.clone(),
            Some(requested) => ProviderInstanceRef {
                provider_id: provider_id.clone(),
                instance_id: selected_by_provider
                    .get(provider_id)
                    .cloned()
                    .or_else(|| requested.instance_id.clone()),
            },
            None => ProviderInstanceRef {
                provider_id: provider_id.clone(),
                instance_id: selected_by_provider.get(provider_id).cloned(),
            },
        })
        .collect()
}

fn load_selected_instance_ids(app_data_dir: &std::path::Path) -> HashMap<String, String> {
    for path in [
        app_data_dir.join("settings.json"),
        app_data_dir.join(".store").join("settings.json"),
    ] {
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let Some(configs) = json
            .get("providerConfigs")
            .and_then(serde_json::Value::as_object)
        else {
            continue;
        };
        return configs
            .iter()
            .filter_map(|(provider_id, config)| {
                config
                    .get("selectedAccountProfileId")
                    .and_then(serde_json::Value::as_str)
                    .and_then(|instance_id| normalize_instance_id(Some(instance_id.to_string())))
                    .map(|instance_id| (provider_id.clone(), instance_id))
            })
            .collect();
    }
    HashMap::new()
}

#[cfg(test)]
mod tests {
    use super::resolve_instance_refs;
    use crate::plugin_engine::runtime::ProviderInstanceRef;

    fn requested(instance_id: Option<&str>) -> Option<Vec<ProviderInstanceRef>> {
        Some(vec![ProviderInstanceRef {
            provider_id: "claude".to_string(),
            instance_id: instance_id.map(str::to_string),
        }])
    }

    fn resolve(app_data_dir: &std::path::Path, instance_id: Option<&str>) -> ProviderInstanceRef {
        resolve_instance_refs(
            app_data_dir,
            &["claude".to_string()],
            requested(instance_id),
        )
        .remove(0)
    }

    fn temp_app_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "usagebar-instance-refs-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).expect("create temp app dir");
        dir
    }

    #[test]
    fn empty_and_blank_instance_ids_resolve_to_the_default_instance() {
        let dir = temp_app_dir("blank");
        let default_instance = resolve(&dir, None);
        assert_eq!(default_instance.instance_id, None);
        assert_eq!(resolve(&dir, Some("")), default_instance);
        assert_eq!(resolve(&dir, Some("  ")), default_instance);
    }

    #[test]
    fn instance_ids_are_trimmed_like_the_plugin_reads_them() {
        let dir = temp_app_dir("trim");
        assert_eq!(
            resolve(&dir, Some(" profile-a ")),
            resolve(&dir, Some("profile-a"))
        );
    }

    #[test]
    fn a_blank_selected_profile_resolves_to_the_default_instance() {
        let dir = temp_app_dir("selected");
        std::fs::write(
            dir.join("settings.json"),
            r#"{"providerConfigs":{"claude":{"selectedAccountProfileId":" "}}}"#,
        )
        .expect("write settings");
        assert_eq!(resolve(&dir, None).instance_id, None);
        assert_eq!(resolve(&dir, Some("")).instance_id, None);
    }
}
