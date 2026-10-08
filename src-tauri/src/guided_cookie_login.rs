#[tauri::command]
pub(crate) async fn capture_provider_cookie_header(
    app_handle: tauri::AppHandle,
    provider_id: String,
    window_title: String,
    login_url: String,
    success_url_contains: String,
    cookie_urls: Vec<String>,
) -> Result<crate::plugin_engine::browser_bridge::GuidedCookieCaptureResponse, String> {
    crate::validate_guided_cookie_capture_request(
        &provider_id,
        &login_url,
        &success_url_contains,
        &cookie_urls,
    )?;
    let cookie_names = crate::guided_cookie_policy(&provider_id)
        .expect("validated guided cookie provider must have a policy")
        .cookie_names
        .iter()
        .map(|name| (*name).to_string())
        .collect();
    log::info!(
        "starting guided cookie login for provider='{}'",
        provider_id.trim()
    );
    // Cookie capture waits for native window events. Keep that wait off the UI thread.
    tauri::async_runtime::spawn_blocking(move || {
        crate::plugin_engine::browser_bridge::capture_cookies_interactively(
            &app_handle,
            &crate::plugin_engine::browser_bridge::GuidedCookieCaptureParams {
                provider_id,
                window_title,
                login_url,
                success_url_contains,
                cookie_urls,
                cookie_names,
            },
        )
    })
    .await
    .map_err(|error| format!("guided login worker failed: {error}"))?
}
