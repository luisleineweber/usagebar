use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;
use tauri::webview::{Cookie, Url, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, WebviewUrl};
use uuid::Uuid;

const DEFAULT_SOURCE_URL: &str = "https://dashboard.zed.dev/account";
const DEFAULT_TIMEOUT_MS: u64 = 15_000;
const MAX_TIMEOUT_MS: u64 = 60_000;
const MIN_TIMEOUT_MS: u64 = 1_000;
const RESULT_SCHEME: &str = "openusage-browser";
const RESULT_HOST: &str = "result";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRequestWithCookiesParams {
    pub url: String,
    pub cookie_header: String,
    pub source_url: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRequestResponse {
    pub status: u16,
    pub body_text: String,
    pub final_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserBridgePayload {
    status: Option<u16>,
    body_text: Option<String>,
    final_url: Option<String>,
    error: Option<String>,
}

enum BrowserChannelMessage {
    Success(BrowserRequestResponse),
    Error(String),
}

pub fn request_with_cookies(
    app_handle: &AppHandle,
    req: &BrowserRequestWithCookiesParams,
) -> Result<BrowserRequestResponse, String> {
    let cookie_header = req.cookie_header.trim();
    if cookie_header.is_empty() {
        return Err("cookie header is required".to_string());
    }

    let target_url = normalize_https_url(&req.url, "request url")?;
    let source_url = normalize_https_url(
        req.source_url.as_deref().unwrap_or(DEFAULT_SOURCE_URL),
        "source url",
    )?;
    let timeout_ms = req
        .timeout_ms
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    let cookies = parse_cookie_header(cookie_header)?;
    let label = format!("openusage-browser-{}", Uuid::new_v4());
    let (tx, rx) = mpsc::channel::<BrowserChannelMessage>();
    let sender = Arc::new(Mutex::new(Some(tx)));

    let sender_for_build = Arc::clone(&sender);
    let app_for_build = app_handle.clone();
    let label_for_build = label.clone();
    let source_url_for_build = source_url.clone();
    let target_url_for_build = target_url.clone();
    let cookies_for_build = cookies.clone();

    app_handle
        .run_on_main_thread(move || {
            if let Err(error) = build_hidden_browser_request(
                &app_for_build,
                &label_for_build,
                &source_url_for_build,
                &target_url_for_build,
                &cookies_for_build,
                sender_for_build,
            ) {
                send_browser_message(
                    &sender,
                    BrowserChannelMessage::Error(format!(
                        "browser-backed billing request setup failed: {}",
                        error
                    )),
                );
                close_hidden_browser(&app_for_build, &label_for_build);
            }
        })
        .map_err(|error| format!("browser-backed billing request unavailable: {}", error))?;

    match rx.recv_timeout(Duration::from_millis(timeout_ms)) {
        Ok(BrowserChannelMessage::Success(response)) => Ok(response),
        Ok(BrowserChannelMessage::Error(error)) => Err(error),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            close_hidden_browser(app_handle, &label);
            Err("browser-backed billing request timed out".to_string())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            close_hidden_browser(app_handle, &label);
            Err("browser-backed billing request cancelled unexpectedly".to_string())
        }
    }
}

fn build_hidden_browser_request(
    app_handle: &AppHandle,
    label: &str,
    source_url: &str,
    target_url: &str,
    cookies: &[(String, String)],
    sender: Arc<Mutex<Option<mpsc::Sender<BrowserChannelMessage>>>>,
) -> Result<(), String> {
    let app_for_nav = app_handle.clone();
    let label_for_nav = label.to_string();
    let sender_for_nav = Arc::clone(&sender);
    let init_script = build_fetch_bridge_script(target_url);

    let window = WebviewWindowBuilder::new(
        app_handle,
        label,
        WebviewUrl::External(
            "about:blank"
                .parse::<Url>()
                .map_err(|error| format!("invalid bootstrap url: {}", error))?,
        ),
    )
    .title("UsageBar Hidden Browser")
    .visible(false)
    .initialization_script(init_script)
    .on_navigation(move |url| {
        if url.scheme() != RESULT_SCHEME {
            return true;
        }

        let message = parse_bridge_result(url).unwrap_or_else(BrowserChannelMessage::Error);
        send_browser_message(&sender_for_nav, message);
        close_hidden_browser(&app_for_nav, &label_for_nav);
        false
    })
    .build()
    .map_err(|error| format!("failed to build hidden browser: {}", error))?;

    for domain in ["dashboard.zed.dev", "cloud.zed.dev"] {
        for (name, value) in cookies {
            let cookie = Cookie::build((name.as_str(), value.as_str()))
                .domain(domain)
                .path("/")
                .secure(true)
                .http_only(true)
                .build()
                .into_owned();
            window
                .set_cookie(cookie)
                .map_err(|error| format!("failed to set browser cookie '{}': {}", name, error))?;
        }
    }

    window
        .navigate(
            source_url
                .parse::<Url>()
                .map_err(|error| format!("invalid source url: {}", error))?,
        )
        .map_err(|error| format!("failed to navigate hidden browser: {}", error))?;

    Ok(())
}

fn parse_cookie_header(header: &str) -> Result<Vec<(String, String)>, String> {
    let mut cookies = Vec::new();

    for segment in header.split(';') {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Some((name, value)) = trimmed.split_once('=') else {
            return Err(format!("invalid cookie segment '{}'", trimmed));
        };

        let name = name.trim();
        if name.is_empty() {
            return Err("cookie name cannot be empty".to_string());
        }

        cookies.push((name.to_string(), value.trim().to_string()));
    }

    if cookies.is_empty() {
        return Err("cookie header did not contain any cookies".to_string());
    }

    Ok(cookies)
}

fn normalize_https_url(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} is required", label));
    }

    let parsed = trimmed
        .parse::<Url>()
        .map_err(|error| format!("invalid {}: {}", label, error))?;
    if parsed.scheme() != "https" {
        return Err(format!("{} must use https", label));
    }

    Ok(parsed.to_string())
}

fn build_fetch_bridge_script(target_url: &str) -> String {
    let target_url_json =
        serde_json::to_string(target_url).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        r#"
(() => {{
  if (window.__OPENUSAGE_BROWSER_FETCH_STARTED__) return;
  if (window.location.origin !== "https://dashboard.zed.dev") return;
  window.__OPENUSAGE_BROWSER_FETCH_STARTED__ = true;

  const targetUrl = {target_url_json};
  const finish = (payload) => {{
    const encoded = encodeURIComponent(JSON.stringify(payload));
    window.location.replace("{RESULT_SCHEME}://{RESULT_HOST}?payload=" + encoded);
  }};

  Promise.resolve().then(async () => {{
    try {{
      const response = await fetch(targetUrl, {{
        method: "GET",
        credentials: "include",
        headers: {{ "Content-Type": "application/json" }}
      }});
      const bodyText = await response.text();
      finish({{
        status: response.status,
        bodyText,
        finalUrl: targetUrl
      }});
    }} catch (error) {{
      finish({{
        error: String(error)
      }});
    }}
  }});
}})();
"#
    )
}

fn parse_bridge_result(url: &Url) -> Result<BrowserChannelMessage, String> {
    if url.scheme() != RESULT_SCHEME {
        return Err("browser bridge returned an unexpected scheme".to_string());
    }

    let Some(payload_json) = url
        .query_pairs()
        .find_map(|(key, value)| (key == "payload").then(|| value.into_owned()))
    else {
        return Err("browser bridge payload missing".to_string());
    };

    let payload: BrowserBridgePayload = serde_json::from_str(&payload_json)
        .map_err(|error| format!("browser bridge payload invalid: {}", error))?;

    if let Some(error) = payload.error {
        return Ok(BrowserChannelMessage::Error(format!(
            "browser-backed billing request failed: {}",
            error
        )));
    }

    let status = payload
        .status
        .ok_or_else(|| "browser bridge payload missing status".to_string())?;
    let body_text = payload
        .body_text
        .ok_or_else(|| "browser bridge payload missing bodyText".to_string())?;
    let final_url = payload.final_url.unwrap_or_default();

    Ok(BrowserChannelMessage::Success(BrowserRequestResponse {
        status,
        body_text,
        final_url,
    }))
}

fn send_browser_message(
    sender: &Arc<Mutex<Option<mpsc::Sender<BrowserChannelMessage>>>>,
    message: BrowserChannelMessage,
) {
    let maybe_sender = sender.lock().ok().and_then(|mut slot| slot.take());
    if let Some(tx) = maybe_sender {
        let _ = tx.send(message);
    }
}

fn close_hidden_browser(app_handle: &AppHandle, label: &str) {
    if let Some(window) = app_handle.get_webview_window(label) {
        let _ = window.close();
    }
}

#[cfg(test)]
mod tests {
    use super::{build_fetch_bridge_script, normalize_https_url, parse_cookie_header};

    #[test]
    fn parse_cookie_header_preserves_value_equals() {
        let cookies = parse_cookie_header("foo=bar=baz; zed.session=abc={\"sid\":\"123\"}")
            .expect("cookies");
        assert_eq!(
            cookies,
            vec![
                ("foo".to_string(), "bar=baz".to_string()),
                ("zed.session".to_string(), "abc={\"sid\":\"123\"}".to_string())
            ]
        );
    }

    #[test]
    fn parse_cookie_header_rejects_invalid_segments() {
        let error = parse_cookie_header("foo=bar; broken-segment").expect_err("invalid header");
        assert!(error.contains("broken-segment"));
    }

    #[test]
    fn normalize_https_url_rejects_non_https_urls() {
        let error = normalize_https_url("http://example.com", "request url")
            .expect_err("http should fail");
        assert!(error.contains("must use https"));
    }

    #[test]
    fn build_fetch_bridge_script_targets_dashboard_origin_and_bridge_scheme() {
        let script = build_fetch_bridge_script("https://cloud.zed.dev/frontend/billing/usage");
        assert!(script.contains("window.location.origin !== \"https://dashboard.zed.dev\""));
        assert!(script.contains("openusage-browser://result?payload="));
        assert!(script.contains("credentials: \"include\""));
    }
}
