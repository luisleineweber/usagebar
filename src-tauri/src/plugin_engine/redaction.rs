/// Redact sensitive value to first4...last4 format (UTF-8 safe)
pub(crate) fn redact_value(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 12 {
        "[REDACTED]".to_string()
    } else {
        let first4: String = chars.iter().take(4).collect();
        let last4: String = chars
            .iter()
            .rev()
            .take(4)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        format!("{}...{}", first4, last4)
    }
}

/// Redact sensitive query parameters in URL
pub(crate) fn redact_url(url: &str) -> String {
    let sensitive_params = [
        "key",
        "api_key",
        "apikey",
        "token",
        "access_token",
        "secret",
        "password",
        "auth",
        "authorization",
        "bearer",
        "credential",
        "user",
        "user_id",
        "userid",
        "account_id",
        "accountid",
        "email",
        "login",
    ];

    if let Some(query_start) = url.find('?') {
        let (base, query) = url.split_at(query_start + 1);
        let redacted_params: Vec<String> = query
            .split('&')
            .map(|param| {
                if let Some(eq_pos) = param.find('=') {
                    let (name, value) = param.split_at(eq_pos);
                    let value = &value[1..];
                    let name_lower = name.to_lowercase();
                    if sensitive_params.iter().any(|s| name_lower.contains(s)) && !value.is_empty()
                    {
                        format!("{}={}", name, redact_value(value))
                    } else {
                        param.to_string()
                    }
                } else {
                    param.to_string()
                }
            })
            .collect();
        format!("{}{}", base, redacted_params.join("&"))
    } else {
        url.to_string()
    }
}

/// Redact sensitive patterns in response body for logging
pub(crate) fn redact_body(body: &str) -> String {
    let mut result = body.to_string();

    let jwt_pattern =
        regex_lite::Regex::new(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+").unwrap();
    result = jwt_pattern
        .replace_all(&result, |caps: &regex_lite::Captures| {
            redact_value(&caps[0])
        })
        .to_string();

    let api_key_pattern =
        regex_lite::Regex::new(r#"["']?(sk-|pk-|fk-|api_|key_|secret_)[A-Za-z0-9_-]{12,}["']?"#)
            .unwrap();
    result = api_key_pattern
        .replace_all(&result, |caps: &regex_lite::Captures| {
            let key = caps[0].trim_matches(|c| c == '"' || c == '\'');
            redact_value(key)
        })
        .to_string();

    let sensitive_keys = [
        "name",
        "password",
        "token",
        "access_token",
        "refresh_token",
        "secret",
        "api_key",
        "apiKey",
        "authorization",
        "bearer",
        "credential",
        "session_token",
        "sessionToken",
        "auth_token",
        "authToken",
        "id_token",
        "idToken",
        "accessToken",
        "refreshToken",
        "user_id",
        "userId",
        "account_id",
        "accountId",
        "cloudaicompanionProject",
        "email",
        "login",
        "analytics_tracking_id",
    ];
    for key in sensitive_keys {
        let pattern = format!(r#""{}":\s*"([^"]+)""#, key);
        if let Ok(re) = regex_lite::Regex::new(&pattern) {
            result = re
                .replace_all(&result, |caps: &regex_lite::Captures| {
                    format!("\"{}\": \"{}\"", key, redact_value(&caps[1]))
                })
                .to_string();
        }
    }

    result
}

const CREDENTIAL_HEADER_MARKERS: [&str; 7] = [
    "auth", "cookie", "key", "password", "secret", "session", "token",
];
/// Shorter values are too likely to match ordinary response text.
const MIN_ECHOED_CREDENTIAL_LEN: usize = 8;

/// Credential values a plugin sent in request headers. A provider can echo a submitted
/// credential in an error body, and the pattern redactor cannot know every credential format.
pub(crate) fn request_credential_values(
    headers: Option<&std::collections::HashMap<String, String>>,
) -> Vec<String> {
    let mut values: Vec<String> = Vec::new();
    for (name, value) in headers.into_iter().flatten() {
        let name = name.to_ascii_lowercase();
        if !CREDENTIAL_HEADER_MARKERS
            .iter()
            .any(|marker| name.contains(marker))
        {
            continue;
        }
        let value = value.trim();
        values.push(value.to_string());
        // "Bearer <token>" and "Basic <token>": the token alone can be echoed.
        if let Some((_, token)) = value.split_once(' ') {
            values.push(token.trim().to_string());
        }
        if name == "cookie" {
            for pair in value.split(';') {
                if let Some((_, cookie_value)) = pair.split_once('=') {
                    values.push(cookie_value.trim().to_string());
                }
            }
        }
    }
    values.retain(|value| value.chars().count() >= MIN_ECHOED_CREDENTIAL_LEN);
    // Longest first, so a full header value is masked before its token part.
    values.sort_by_key(|value| std::cmp::Reverse(value.len()));
    values.dedup();
    values
}

/// Response body preview for the HTTP log. Echoed request credentials are masked before
/// pattern redaction, and both run before truncation so values are caught while intact.
pub(crate) fn http_body_log_preview(body: &str, credential_values: &[String]) -> String {
    let mut masked = body.to_string();
    for value in credential_values {
        masked = masked.replace(value.as_str(), "[REDACTED]");
    }
    let redacted = redact_body(&masked);
    if redacted.len() <= 500 {
        return redacted;
    }
    // UTF-8 safe truncation: keep characters that start before byte 500.
    let truncated: String = redacted
        .char_indices()
        .take_while(|(i, _)| *i < 500)
        .map(|(_, c)| c)
        .collect();
    format!("{}... ({} bytes total)", truncated, body.len())
}

/// Lightweight redaction for plugin log messages (JWT + API key patterns only).
pub(crate) fn redact_log_message(msg: &str) -> String {
    let mut result = msg.to_string();
    if let Ok(jwt_re) = regex_lite::Regex::new(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
    {
        result = jwt_re
            .replace_all(&result, |caps: &regex_lite::Captures| {
                redact_value(&caps[0])
            })
            .to_string();
    }
    if let Ok(api_re) =
        regex_lite::Regex::new(r#"(sk-|pk-|fk-|api_|key_|secret_)[A-Za-z0-9_-]{12,}"#)
    {
        result = api_re
            .replace_all(&result, |caps: &regex_lite::Captures| {
                redact_value(&caps[0])
            })
            .to_string();
    }
    result
}

pub(crate) fn sanitize_allowed_domains(domains: &[String]) -> Vec<String> {
    domains
        .iter()
        .map(|domain| domain.trim().trim_end_matches('.').to_ascii_lowercase())
        .filter(|domain| !domain.is_empty())
        .collect()
}

pub(crate) fn is_url_allowed_by_domains(url: &str, allowed_domains: &[String]) -> bool {
    if allowed_domains.is_empty() {
        return false;
    }

    let parsed = match reqwest::Url::parse(url) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let host = host.trim_end_matches('.').to_ascii_lowercase();

    allowed_domains.iter().any(|allowed| {
        if let Some(suffix) = allowed.strip_prefix("*.") {
            host.ends_with(&format!(".{}", suffix)) && host != suffix
        } else {
            host == *allowed
        }
    })
}
