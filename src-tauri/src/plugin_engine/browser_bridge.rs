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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuidedCookieCaptureParams {
    pub provider_id: String,
    pub window_title: String,
    pub login_url: String,
    pub success_url_contains: String,
    pub cookie_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuidedCookieCaptureResponse {
    pub cookie_header: String,
    pub final_url: String,
    pub cookie_count: usize,
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

enum CookieCaptureMessage {
    Success(GuidedCookieCaptureResponse),
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

pub fn capture_cookies_interactively(
    app_handle: &AppHandle,
    req: &GuidedCookieCaptureParams,
) -> Result<GuidedCookieCaptureResponse, String> {
    let provider_id = req.provider_id.trim();
    if provider_id.is_empty() {
        return Err("provider is required".to_string());
    }

    let login_url = normalize_https_url(&req.login_url, "login url")?;
    let success_url_contains = req.success_url_contains.trim();
    if success_url_contains.is_empty() {
        return Err("success URL marker is required".to_string());
    }

    let mut cookie_urls = Vec::new();
    for value in &req.cookie_urls {
        cookie_urls.push(normalize_https_url(value, "cookie url")?);
    }
    if cookie_urls.is_empty() {
        return Err("at least one cookie URL is required".to_string());
    }

    let title = req.window_title.trim();
    let title = if title.is_empty() {
        "Connect provider"
    } else {
        title
    };
    let label = format!("openusage-cookie-login-{}-{}", provider_id, Uuid::new_v4());
    let (tx, rx) = mpsc::channel::<CookieCaptureMessage>();
    let sender = Arc::new(Mutex::new(Some(tx)));

    let app_for_build = app_handle.clone();
    let label_for_build = label.clone();
    let login_url_for_build = login_url.clone();
    let success_marker_for_build = success_url_contains.to_string();
    let cookie_urls_for_build = cookie_urls.clone();
    let title_for_build = title.to_string();
    let sender_for_build = Arc::clone(&sender);

    app_handle
        .run_on_main_thread(move || {
            if let Err(error) = build_cookie_capture_window(
                &app_for_build,
                &label_for_build,
                &title_for_build,
                &login_url_for_build,
                &success_marker_for_build,
                &cookie_urls_for_build,
                sender_for_build,
            ) {
                send_cookie_capture_message(
                    &sender,
                    CookieCaptureMessage::Error(format!("guided login setup failed: {}", error)),
                );
                close_hidden_browser(&app_for_build, &label_for_build);
            }
        })
        .map_err(|error| format!("guided login unavailable: {}", error))?;

    match rx.recv() {
        Ok(CookieCaptureMessage::Success(response)) => Ok(response),
        Ok(CookieCaptureMessage::Error(error)) => Err(error),
        Err(_) => Err("guided login cancelled unexpectedly".to_string()),
    }
}

fn build_cookie_capture_window(
    app_handle: &AppHandle,
    label: &str,
    title: &str,
    login_url: &str,
    success_url_contains: &str,
    cookie_urls: &[String],
    sender: Arc<Mutex<Option<mpsc::Sender<CookieCaptureMessage>>>>,
) -> Result<(), String> {
    let app_for_nav = app_handle.clone();
    let label_for_nav = label.to_string();
    let success_marker = success_url_contains.to_string();
    let cookie_urls_for_nav = cookie_urls.to_vec();
    let sender_for_nav = Arc::clone(&sender);

    let window = WebviewWindowBuilder::new(
        app_handle,
        label,
        WebviewUrl::External(
            login_url
                .parse::<Url>()
                .map_err(|error| format!("invalid login url: {}", error))?,
        ),
    )
    .title(title)
    .inner_size(1040.0, 760.0)
    .visible(true)
    .on_navigation(move |url| {
        let current = url.to_string();
        if !current.contains(&success_marker) {
            return true;
        }

        let Some(window) = app_for_nav.get_webview_window(&label_for_nav) else {
            send_cookie_capture_message(
                &sender_for_nav,
                CookieCaptureMessage::Error("guided login window disappeared".to_string()),
            );
            return false;
        };

        let result = cookie_header_for_urls(&window, &cookie_urls_for_nav).map(
            |(cookie_header, cookie_count)| GuidedCookieCaptureResponse {
                cookie_header,
                final_url: current.clone(),
                cookie_count,
            },
        );

        match result {
            Ok(response) => send_cookie_capture_message(
                &sender_for_nav,
                CookieCaptureMessage::Success(response),
            ),
            Err(error) => {
                send_cookie_capture_message(&sender_for_nav, CookieCaptureMessage::Error(error))
            }
        }
        close_hidden_browser(&app_for_nav, &label_for_nav);
        false
    })
    .build()
    .map_err(|error| format!("failed to build guided login window: {}", error))?;

    let app_for_close = app_handle.clone();
    let label_for_close = label.to_string();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            send_cookie_capture_message(
                &sender,
                CookieCaptureMessage::Error(
                    "guided login was closed before cookies were captured".to_string(),
                ),
            );
            close_hidden_browser(&app_for_close, &label_for_close);
        }
    });

    Ok(())
}

fn cookie_header_for_urls(
    window: &tauri::WebviewWindow,
    cookie_urls: &[String],
) -> Result<(String, usize), String> {
    let mut pairs = Vec::<String>::new();
    let mut seen = Vec::<String>::new();

    for value in cookie_urls {
        let url = value
            .parse::<Url>()
            .map_err(|error| format!("invalid cookie url: {}", error))?;
        let cookies = window
            .cookies_for_url(url)
            .map_err(|error| format!("failed to read guided login cookies: {}", error))?;
        for cookie in cookies {
            let name = cookie.name().trim();
            if name.is_empty() {
                continue;
            }
            let key = format!("{}={}", name, cookie.value());
            if seen.iter().any(|existing| existing == &key) {
                continue;
            }
            seen.push(key);
            pairs.push(format!("{}={}", name, cookie.value()));
        }
    }

    if pairs.is_empty() {
        return Err(
            "guided login reached the target page but no cookies were available".to_string(),
        );
    }

    let cookie_count = pairs.len();
    Ok((pairs.join("; "), cookie_count))
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
    let init_script = build_fetch_bridge_script(source_url, target_url);

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

    for domain in cookie_domains(source_url, target_url)? {
        for (name, value) in cookies {
            let cookie = Cookie::build((name.as_str(), value.as_str()))
                .domain(domain.as_str())
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

fn cookie_domains(source_url: &str, target_url: &str) -> Result<Vec<String>, String> {
    let mut domains = Vec::new();
    for value in [source_url, target_url] {
        let parsed = value
            .parse::<Url>()
            .map_err(|error| format!("invalid cookie domain url: {}", error))?;
        let host = parsed
            .host_str()
            .ok_or_else(|| "cookie domain url missing host".to_string())?
            .to_string();
        if !domains.iter().any(|existing| existing == &host) {
            domains.push(host);
        }
    }
    Ok(domains)
}

fn build_fetch_bridge_script(source_url: &str, target_url: &str) -> String {
    let source_origin = source_url
        .parse::<Url>()
        .ok()
        .and_then(|url| {
            url.host_str()
                .map(|host| format!("{}://{}", url.scheme(), host))
        })
        .unwrap_or_else(|| "https://dashboard.zed.dev".to_string());
    let source_origin_json =
        serde_json::to_string(&source_origin).unwrap_or_else(|_| "\"\"".to_string());
    let target_url_json = serde_json::to_string(target_url).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        r#"
(() => {{
  if (window.__OPENUSAGE_BROWSER_FETCH_STARTED__) return;
  if (window.location.origin !== {source_origin_json}) return;
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

fn send_cookie_capture_message(
    sender: &Arc<Mutex<Option<mpsc::Sender<CookieCaptureMessage>>>>,
    message: CookieCaptureMessage,
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
    use super::{
        build_fetch_bridge_script, cookie_domains, normalize_https_url, parse_cookie_header,
    };

    #[test]
    fn parse_cookie_header_preserves_value_equals() {
        let cookies =
            parse_cookie_header("foo=bar=baz; zed.session=abc={\"sid\":\"123\"}").expect("cookies");
        assert_eq!(
            cookies,
            vec![
                ("foo".to_string(), "bar=baz".to_string()),
                (
                    "zed.session".to_string(),
                    "abc={\"sid\":\"123\"}".to_string()
                )
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
        let error =
            normalize_https_url("http://example.com", "request url").expect_err("http should fail");
        assert!(error.contains("must use https"));
    }

    #[test]
    fn build_fetch_bridge_script_targets_dashboard_origin_and_bridge_scheme() {
        let script = build_fetch_bridge_script(
            "https://dashboard.zed.dev/account",
            "https://cloud.zed.dev/frontend/billing/usage",
        );
        assert!(script.contains("window.location.origin !== \"https://dashboard.zed.dev\""));
        assert!(script.contains("openusage-browser://result?payload="));
        assert!(script.contains("credentials: \"include\""));
    }

    #[test]
    fn build_fetch_bridge_script_uses_requested_source_origin() {
        let script = build_fetch_bridge_script(
            "https://chatgpt.com/",
            "https://chatgpt.com/codex/cloud/settings/analytics",
        );
        assert!(script.contains("window.location.origin !== \"https://chatgpt.com\""));
        assert!(script.contains("https://chatgpt.com/codex/cloud/settings/analytics"));
    }

    #[test]
    fn cookie_domains_include_source_and_target_hosts_once() {
        let domains = cookie_domains(
            "https://dashboard.zed.dev/account",
            "https://cloud.zed.dev/frontend/billing/usage",
        )
        .expect("domains");
        assert_eq!(
            domains,
            vec!["dashboard.zed.dev".to_string(), "cloud.zed.dev".to_string()]
        );

        let same = cookie_domains("https://chatgpt.com/", "https://chatgpt.com/codex")
            .expect("same domain");
        assert_eq!(same, vec!["chatgpt.com".to_string()]);
    }
}
