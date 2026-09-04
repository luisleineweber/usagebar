use rquickjs::{Function, Object, Value};
use serde::Serialize;

const MAX_SETUP_CHECKS: usize = 32;
const MAX_SETUP_CHECK_ID_LENGTH: usize = 96;

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
    use super::{SetupDetectionState, parse};
    use rquickjs::{Context, Runtime};

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
