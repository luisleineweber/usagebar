// Exercise the production IPC command and browser bridge with real Windows WebView2.
// Keep the test profile separate from the user's app profile.
#[cfg(target_os = "windows")]
#[allow(dead_code, unused_imports)]
#[path = "../src/plugin_engine/browser_bridge.rs"]
pub mod browser_bridge;
#[cfg(target_os = "windows")]
#[allow(dead_code, unused_imports)]
#[path = "../src/credential_support.rs"]
mod credential_support;
#[cfg(target_os = "windows")]
#[path = "../src/guided_cookie_login.rs"]
mod guided_cookie_login;

#[cfg(target_os = "windows")]
mod plugin_engine {
    pub use super::browser_bridge;
}

#[cfg(target_os = "windows")]
use credential_support::{guided_cookie_policy, validate_guided_cookie_capture_request};
#[cfg(target_os = "windows")]
#[allow(dead_code, unused_imports)]
#[path = "../src/plugin_engine/approved_cookies.rs"]
mod approved_cookies;

// The native login test must not read system credentials.
#[cfg(target_os = "windows")]
fn is_missing_credential_error(_: &str) -> bool {
    panic!("the login window test must not read system credentials")
}

#[cfg(target_os = "windows")]
fn main() {
    if let Some(provider_id) = std::env::args().nth(1) {
        run_login_test(
            provider_id,
            std::env::args().nth(2).as_deref() == Some("capture"),
        );
        return;
    }

    let executable = std::env::current_exe().expect("find native test executable");
    let mut failed = Vec::new();
    for provider_id in ["zed", "opencode", "abacus", "perplexity"] {
        for mode in ["cancel", "capture"] {
            println!("Checking guided login for {provider_id}: {mode}");
            let status = std::process::Command::new(&executable)
                .args([provider_id, mode])
                .status()
                .expect("run native provider test");
            if !status.success() {
                failed.push(format!("{provider_id}: {mode}"));
            }
        }
    }
    assert!(failed.is_empty(), "native login failed for {failed:?}");
}

#[cfg(target_os = "windows")]
fn run_login_test(provider_id: String, capture: bool) {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let policy = guided_cookie_policy(&provider_id).expect("known guided login provider");

    let server = TcpListener::bind("127.0.0.1:0").expect("start local page server");
    let page_url = format!("http://{}/", server.local_addr().unwrap());
    let page_url = format!(
        "{}{}",
        page_url,
        policy.success_url_contains.trim_start_matches('/')
    );
    let expected_page_url = page_url.clone();
    std::thread::spawn(move || {
        for stream in server.incoming() {
            let mut stream = stream.expect("accept page request");
            let mut request = [0; 4096];
            if stream.read(&mut request).expect("read page request") == 0 {
                continue;
            }
            let body = "<body>Guided login loaded<script>location.hash='loaded';setTimeout(()=>location.hash='ready',200)</script>";
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .expect("serve local page");
        }
    });

    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().identifier = format!("com.usagebar.login-test.{}", uuid::Uuid::new_v4());
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            guided_cookie_login::capture_provider_cookie_header
        ])
        .build(context)
        .expect("build native test app");
    WebviewWindowBuilder::new(
        &app,
        "main",
        WebviewUrl::External("about:blank".parse().unwrap()),
    )
    .visible(false)
    .build()
    .expect("build IPC window");

    let handle = app.handle().clone();
    let (done_tx, done_rx) = mpsc::channel();
    std::thread::spawn(move || {
        match done_rx.recv_timeout(Duration::from_secs(10)) {
            Ok(true) => {
                println!(
                    "PASS: native login completed the {} check",
                    if capture { "capture" } else { "cancellation" }
                )
            }
            _ => {
                eprintln!(
                    "FAIL: guided login blocked the native page or returned the wrong result"
                );
                std::process::exit(1);
            }
        }
        handle.exit(0);
    });

    let handle = app.handle().clone();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            let login = handle
                .webview_windows()
                .into_values()
                .find(|window| window.label().starts_with("openusage-cookie-login-"));
            if let Some(login) = login {
                println!("Native login window created");
                if capture {
                    let cookie_url = policy.cookie_urls[0].parse::<tauri::Url>().unwrap();
                    for name in [policy.cookie_names[0], "unapproved_fixture_cookie"] {
                        login
                            .set_cookie(
                                tauri::webview::Cookie::build((name, "native-test-value"))
                                    .domain(cookie_url.host_str().unwrap().to_string())
                                    .path("/")
                                    .secure(true)
                                    .http_only(true)
                                    .build(),
                            )
                            .expect("set fixture cookie in the isolated test profile");
                    }
                }
                // Replace the remote page with deterministic content. Its script can
                // execute only when the native event loop continues after the IPC call.
                login
                    .navigate(page_url.parse().unwrap())
                    .expect("load test page");
                println!("Local page navigation requested");
                if capture {
                    return;
                }
                while Instant::now() < deadline {
                    if login.url().is_ok_and(|url| url.fragment() == Some("ready")) {
                        println!("Local page script completed");
                        login.close().expect("close login window");
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    });

    let invoke_key = app.invoke_key().to_string();
    let mut done_tx = Some(done_tx);
    app.run(move |app, event| {
        if !matches!(event, tauri::RunEvent::Ready) {
            return;
        }
        let window = app.get_webview_window("main").unwrap();
        let webview: &tauri::Webview = window.as_ref();
        let done_tx = done_tx.take().unwrap();
        let expected_page_url = expected_page_url.clone();
        webview.clone().on_message(
            tauri::webview::InvokeRequest {
                cmd: "capture_provider_cookie_header".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(serde_json::json!({
                    "providerId": provider_id,
                    "windowTitle": "UsageBar login test",
                    "loginUrl": policy.login_url,
                    "successUrlContains": policy.success_url_contains,
                    "cookieUrls": policy.cookie_urls
                })),
                headers: Default::default(),
                invoke_key: invoke_key.clone(),
            },
            Box::new(move |_, _, response, _, _| {
                let correct = match response {
                    tauri::ipc::InvokeResponse::Err(error) => {
                        println!("Login result: {}", error.0);
                        !capture
                            && error.0.as_str().is_some_and(|message| {
                                message == "guided login was closed before cookies were captured"
                            })
                    }
                    tauri::ipc::InvokeResponse::Ok(body) => {
                        let result: serde_json::Value =
                            body.deserialize().expect("read capture result");
                        capture
                            && result["cookieHeader"]
                                == format!("{}=native-test-value", policy.cookie_names[0])
                            && result["cookieCount"] == 1
                            && result["finalUrl"]
                                .as_str()
                                .is_some_and(|url| url.starts_with(&expected_page_url))
                    }
                };
                done_tx.send(correct).expect("report login result");
            }),
        );
        println!("Login IPC call returned to the native event loop");
    });
}

#[cfg(not(target_os = "windows"))]
fn main() {}
