use super::cache::{CachedPluginSnapshot, cache_state, enabled_snapshots_ordered};
use super::history::{build_history_response, parse_history_query};
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

const BIND_ADDR: &str = "127.0.0.1:6736";
const MAX_REQUEST_BYTES: usize = 4096;

pub fn start_server() {
    std::thread::spawn(|| {
        let listener = match TcpListener::bind(BIND_ADDR) {
            Ok(listener) => {
                log::info!("local HTTP API listening on {}", BIND_ADDR);
                listener
            }
            Err(error) => {
                log::warn!(
                    "failed to bind local HTTP API on {}: {}; feature disabled for this session",
                    BIND_ADDR,
                    error
                );
                return;
            }
        };

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    std::thread::spawn(move || handle_connection(stream));
                }
                Err(error) => log::debug!("local HTTP API accept error: {}", error),
            }
        }
    });
}

fn handle_connection(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

    let mut buffer = [0u8; MAX_REQUEST_BYTES];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(bytes_read) => bytes_read,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    let first_line = request.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("");

    let response = route(method, raw_path);
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn route(method: &str, raw_path: &str) -> String {
    let (path, query) = raw_path
        .split_once('?')
        .map_or((raw_path, None), |(path, query)| (path, Some(query)));
    let path = if path.len() > 1 {
        path.trim_end_matches('/')
    } else {
        path
    };
    if path == "/v1/health" {
        return match method {
            "GET" => handle_get_health(),
            "OPTIONS" => response_no_content(),
            _ => response_method_not_allowed(),
        };
    }

    if path == "/v1/providers" {
        return match method {
            "GET" => handle_get_providers(),
            "OPTIONS" => response_no_content(),
            _ => response_method_not_allowed(),
        };
    }

    if path == "/v1/latest" {
        return match method {
            "GET" => handle_get_latest(),
            "OPTIONS" => response_no_content(),
            _ => response_method_not_allowed(),
        };
    }

    if path == "/v1/usage" {
        return match method {
            "GET" => handle_get_usage_collection(),
            "OPTIONS" => response_no_content(),
            _ => response_method_not_allowed(),
        };
    }

    if path == "/v1/history" {
        return match method {
            "GET" => handle_get_history(query, None),
            "OPTIONS" => response_no_content(),
            _ => response_method_not_allowed(),
        };
    }

    if let Some(provider_id) = path.strip_prefix("/v1/history/") {
        if !provider_id.is_empty() && !provider_id.contains('/') {
            return match method {
                "GET" => handle_get_history(query, Some(provider_id)),
                "OPTIONS" => response_no_content(),
                _ => response_method_not_allowed(),
            };
        }
    }

    if let Some(provider_id) = path.strip_prefix("/v1/usage/") {
        if !provider_id.is_empty() && !provider_id.contains('/') {
            return match method {
                "GET" => handle_get_usage_single(provider_id),
                "OPTIONS" => response_no_content(),
                _ => response_method_not_allowed(),
            };
        }
    }

    response_not_found("not_found")
}

fn handle_get_history(query: Option<&str>, provider_id: Option<&str>) -> String {
    let mut query = match parse_history_query(query) {
        Ok(query) => query,
        Err(error) => return response_bad_request(&error),
    };

    let snapshots = {
        let state = cache_state().lock().expect("cache state poisoned");
        if let Some(provider_id) = provider_id {
            if !state.known_plugin_ids.iter().any(|id| id == provider_id) {
                return response_not_found("provider_not_found");
            }
            query.set_provider_ids([provider_id.to_string()]);
        }
        enabled_snapshots_ordered(&state)
    };

    let response = build_history_response(snapshots, &query);
    let body = serde_json::to_string(&response).unwrap_or_else(|_| "{}".to_string());
    response_json(200, "OK", &body)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse<'a> {
    ok: bool,
    version: &'a str,
    cached_provider_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderResponse {
    provider_id: String,
    cached: bool,
    fetched_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LatestResponse {
    providers: Vec<CachedPluginSnapshot>,
}

fn handle_get_health() -> String {
    let cached_provider_count = {
        let state = cache_state().lock().expect("cache state poisoned");
        state.snapshots.len()
    };
    let body = serde_json::to_string(&HealthResponse {
        ok: true,
        version: env!("CARGO_PKG_VERSION"),
        cached_provider_count,
    })
    .unwrap_or_else(|_| r#"{"ok":true}"#.to_string());
    response_json(200, "OK", &body)
}

fn handle_get_providers() -> String {
    let providers = {
        let state = cache_state().lock().expect("cache state poisoned");
        state
            .known_plugin_ids
            .iter()
            .map(|provider_id| {
                let snapshot = state.snapshots.get(provider_id);
                ProviderResponse {
                    provider_id: provider_id.clone(),
                    cached: snapshot.is_some(),
                    fetched_at: snapshot.map(|snapshot| snapshot.fetched_at.clone()),
                }
            })
            .collect::<Vec<_>>()
    };
    let body = serde_json::to_string(&providers).unwrap_or_else(|_| "[]".to_string());
    response_json(200, "OK", &body)
}

fn handle_get_latest() -> String {
    let providers = {
        let state = cache_state().lock().expect("cache state poisoned");
        enabled_snapshots_ordered(&state)
    };
    let body =
        serde_json::to_string(&LatestResponse { providers }).unwrap_or_else(|_| "{}".to_string());
    response_json(200, "OK", &body)
}

fn handle_get_usage_collection() -> String {
    let snapshots = {
        let state = cache_state().lock().expect("cache state poisoned");
        enabled_snapshots_ordered(&state)
    };
    let body = serde_json::to_string(&snapshots).unwrap_or_else(|_| "[]".to_string());
    response_json(200, "OK", &body)
}

fn handle_get_usage_single(provider_id: &str) -> String {
    let state = cache_state().lock().expect("cache state poisoned");

    if !state.known_plugin_ids.iter().any(|id| id == provider_id) {
        return response_not_found("provider_not_found");
    }

    match state.snapshots.get(provider_id) {
        Some(snapshot) => {
            let body = serde_json::to_string(snapshot).unwrap_or_else(|_| "{}".to_string());
            response_json(200, "OK", &body)
        }
        None => response_no_content(),
    }
}

const CORS_HEADERS: &str = "\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type";

fn response_json(status: u16, reason: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {} {}\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\n{}\r\nContent-Length: {}\r\n\r\n{}",
        status,
        reason,
        CORS_HEADERS,
        body.len(),
        body,
    )
}

fn response_no_content() -> String {
    format!(
        "HTTP/1.1 204 No Content\r\nConnection: close\r\n{}\r\n\r\n",
        CORS_HEADERS,
    )
}

fn response_not_found(error_code: &str) -> String {
    response_json(
        404,
        "Not Found",
        &format!(r#"{{"error":"{}"}}"#, error_code),
    )
}

fn response_bad_request(message: &str) -> String {
    let body = serde_json::json!({ "error": "invalid_query", "message": message }).to_string();
    response_json(400, "Bad Request", &body)
}

fn response_method_not_allowed() -> String {
    response_json(
        405,
        "Method Not Allowed",
        r#"{"error":"method_not_allowed"}"#,
    )
}

#[cfg(test)]
mod tests {
    use super::super::cache::{CachedPluginSnapshot, cache_state};
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn test_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    fn make_snapshot(id: &str, name: &str) -> CachedPluginSnapshot {
        CachedPluginSnapshot {
            provider_id: id.to_string(),
            display_name: name.to_string(),
            plan: Some("Pro".to_string()),
            lines: vec![],
            history: None,
            fetched_at: "2026-03-26T08:15:30Z".to_string(),
        }
    }

    #[test]
    fn route_get_usage_returns_200() {
        let response = route("GET", "/v1/usage");
        assert!(response.starts_with("HTTP/1.1 200"));
    }

    #[test]
    fn route_get_health_returns_cache_metadata() {
        let _guard = test_lock();
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            state.snapshots.clear();
            state
                .snapshots
                .insert("claude".to_string(), make_snapshot("claude", "Claude"));
        }

        let response = route("GET", "/v1/health");

        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains(r#""ok":true"#));
        assert!(response.contains(r#""cachedProviderCount":1"#));
    }

    #[test]
    fn route_get_providers_returns_known_provider_cache_state() {
        let _guard = test_lock();
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string(), "codex".to_string()];
            state.snapshots.clear();
            state
                .snapshots
                .insert("claude".to_string(), make_snapshot("claude", "Claude"));
        }

        let response = route("GET", "/v1/providers");

        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains(r#""providerId":"claude","cached":true"#));
        assert!(response.contains(r#""providerId":"codex","cached":false"#));
    }

    #[test]
    fn route_get_latest_wraps_enabled_snapshots() {
        let _guard = test_lock();
        let dir = std::env::temp_dir().join(format!(
            "usagebar-http-latest-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join(".store")).unwrap();
        std::fs::write(
            dir.join(".store").join("settings.json"),
            r#"{"plugins":{"order":["codex","claude"],"disabled":["claude"]}}"#,
        )
        .unwrap();
        {
            let mut state = cache_state().lock().unwrap();
            state.app_data_dir = dir.clone();
            state.known_plugin_ids = vec!["claude".to_string(), "codex".to_string()];
            state.snapshots.clear();
            state
                .snapshots
                .insert("claude".to_string(), make_snapshot("claude", "Claude"));
            state
                .snapshots
                .insert("codex".to_string(), make_snapshot("codex", "Codex"));
        }

        let response = route("GET", "/v1/latest");

        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains(r#""providers":[{"providerId":"codex""#));
        assert!(!response.contains(r#""providerId":"claude""#));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn route_unknown_path_returns_404() {
        let response = route("GET", "/v2/something");
        assert!(response.starts_with("HTTP/1.1 404"));
    }

    #[test]
    fn route_post_returns_405() {
        let response = route("POST", "/v1/usage");
        assert!(response.starts_with("HTTP/1.1 405"));
    }

    #[test]
    fn route_options_returns_204_with_cors() {
        let response = route("OPTIONS", "/v1/usage");
        assert!(response.starts_with("HTTP/1.1 204"));
        assert!(response.contains("Access-Control-Allow-Origin: *"));
    }

    #[test]
    fn route_unknown_provider_returns_404() {
        let _guard = test_lock();
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            state.snapshots.clear();
        }

        let response = route("GET", "/v1/usage/nonexistent");
        assert!(response.starts_with("HTTP/1.1 404"));
        assert!(response.contains("provider_not_found"));
    }

    #[test]
    fn route_known_uncached_provider_returns_204() {
        let _guard = test_lock();
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            state.snapshots.clear();
        }

        let response = route("GET", "/v1/usage/claude");
        assert!(response.starts_with("HTTP/1.1 204"));
    }

    #[test]
    fn route_known_cached_provider_returns_200() {
        let _guard = test_lock();
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            state
                .snapshots
                .insert("claude".to_string(), make_snapshot("claude", "Claude"));
        }

        let response = route("GET", "/v1/usage/claude");
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains("fetchedAt"));
    }

    #[test]
    fn route_history_returns_grouped_response() {
        let _guard = test_lock();
        {
            let mut state = cache_state().lock().unwrap();
            state.known_plugin_ids = vec!["claude".to_string()];
            let mut snapshot = make_snapshot("claude", "Claude");
            snapshot.history = Some(crate::plugin_engine::runtime::UsageHistory {
                version: 1,
                source: "ccusage".to_string(),
                time_zone: "UTC".to_string(),
                entries: vec![crate::plugin_engine::runtime::UsageHistoryEntry {
                    period_start: "2026-07-10T00:00:00Z".to_string(),
                    period_end: "2026-07-11T00:00:00Z".to_string(),
                    model: Some("sonnet".to_string()),
                    project: None,
                    account: None,
                    cost_usd: Some(2.5),
                    requests: Some(4.0),
                    input_tokens: Some(100.0),
                    output_tokens: Some(50.0),
                    cache_read_tokens: None,
                    cache_creation_tokens: None,
                    reasoning_tokens: None,
                    total_tokens: Some(150.0),
                }],
            });
            state.snapshots.insert("claude".to_string(), snapshot);
        }

        let response = route("GET", "/v1/history/claude?groupBy=model");

        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains(r#""groupBy":"model""#));
        assert!(response.contains(r#""key":"sonnet""#));
        assert!(response.contains(r#""costUsd":2.5"#));
    }

    #[test]
    fn route_history_rejects_invalid_query() {
        let response = route("GET", "/v1/history?groupBy=hour");
        assert!(response.starts_with("HTTP/1.1 400"));
        assert!(response.contains("invalid_query"));
    }

    #[test]
    fn response_json_includes_cors_headers() {
        let response = response_json(200, "OK", "[]");
        assert!(response.contains("Access-Control-Allow-Origin: *"));
        assert!(response.contains("Content-Type: application/json; charset=utf-8"));
    }
}
