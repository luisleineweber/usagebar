//! Host binding for Claude refresh. The core owns locks and pending credentials.
use super::HttpRespParams;
use super::claude_refresh::{Coordinator, CredentialStore, Target};
use std::path::Path;
use std::sync::{Arc, OnceLock};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshOptions {
    refresh_url: String,
    client_id: String,
    scopes: String,
    expected_access_token: String,
}

pub(super) fn inject<'js>(
    ctx: &rquickjs::Ctx<'js>,
    secrets: &rquickjs::Object<'js>,
    data_dir: &Path,
    instance: &super::ProviderInstanceRef,
    allowed_domains: &[String],
) -> rquickjs::Result<()> {
    use rquickjs::Exception;
    let Some(id) = instance
        .instance_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
    else {
        return Ok(());
    };
    let target = Target {
        data_dir: data_dir.to_path_buf(),
        secret_key: format!("account:{id}:authJson"),
    };
    let home = dirs::home_dir()
        .ok_or_else(|| Exception::throw_message(ctx, "Home directory is unavailable"))?;
    let lock_path = home.join(".usagebar").join("claude-refresh-locks");
    static COORDINATOR: OnceLock<Arc<Coordinator>> = OnceLock::new();
    let coordinator = Arc::clone(COORDINATOR.get_or_init(|| Arc::new(Coordinator::default())));
    inject_transaction(
        ctx,
        secrets,
        target,
        allowed_domains,
        lock_path,
        coordinator,
        request,
    )
}

fn inject_transaction<'js>(
    ctx: &rquickjs::Ctx<'js>,
    secrets: &rquickjs::Object<'js>,
    target: impl CredentialStore + 'js,
    allowed_domains: &[String],
    lock_path: std::path::PathBuf,
    coordinator: Arc<Coordinator>,
    send: impl Fn(&RefreshOptions, &str) -> Result<HttpRespParams, String> + 'js,
) -> rquickjs::Result<()> {
    use rquickjs::{Exception, Function};
    let domains = allowed_domains.to_vec();
    secrets.set(
        "refreshClaudeCredentials",
        Function::new(
            ctx.clone(),
            move |ctx: rquickjs::Ctx<'_>, json: String| -> rquickjs::Result<String> {
                let options: RefreshOptions = serde_json::from_str(&json).map_err(|_| {
                    Exception::throw_message(&ctx, "Invalid Claude refresh options")
                })?;
                if !super::is_url_allowed_by_domains(&options.refresh_url, &domains) {
                    return Err(Exception::throw_message(
                        &ctx,
                        "Claude refresh endpoint is not allowed",
                    ));
                }
                let outcome = coordinator
                    .refresh(
                        &lock_path,
                        &target,
                        &options.expected_access_token,
                        |token| send(&options, token),
                    )
                    .map_err(|error| Exception::throw_message(&ctx, &error))?;
                serde_json::to_string(&outcome).map_err(|_| {
                    Exception::throw_message(&ctx, "Could not encode Claude refresh result")
                })
            },
        )?,
    )?;
    Ok(())
}

fn request(options: &RefreshOptions, token: &str) -> Result<HttpRespParams, String> {
    let proxy = super::load_app_config()
        .and_then(|config| config.proxy)
        .filter(|proxy| {
            proxy.enabled
                && !proxy.url.is_empty()
                && !super::should_bypass_proxy(&options.refresh_url)
        });
    let client = super::build_client_with_proxy(
        15000,
        false,
        proxy.as_ref().map(|proxy| proxy.url.as_str()),
    )
    .map_err(|_| "Could not create Claude refresh connection".to_string())?;
    // Do not log request bodies, token responses, or HTTP error details.
    let response = client.post(&options.refresh_url).header("Content-Type", "application/json")
        .body(serde_json::json!({ "grant_type": "refresh_token", "refresh_token": token, "client_id": options.client_id, "scope": options.scopes }).to_string())
        .send().map_err(|_| "Claude refresh connection failed".to_string())?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect();
    let body_text = response
        .text()
        .map_err(|_| "Could not read Claude refresh response".to_string())?;
    Ok(HttpRespParams {
        status,
        headers,
        body_text,
    })
}

#[cfg(test)]
#[path = "claude_refresh_host_tests.rs"]
mod tests;
