use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeErrorCategory {
    CredentialMissing,
    CredentialUnavailable,
    CredentialUnreadable,
    CredentialInvalid,
    CredentialExpired,
    ProviderResponse,
    Unknown,
}

impl ProbeErrorCategory {
    pub fn from_wire_name(value: &str) -> Option<Self> {
        match value {
            "credentialMissing" => Some(Self::CredentialMissing),
            "credentialUnavailable" => Some(Self::CredentialUnavailable),
            "credentialUnreadable" => Some(Self::CredentialUnreadable),
            "credentialInvalid" => Some(Self::CredentialInvalid),
            "credentialExpired" => Some(Self::CredentialExpired),
            "providerResponse" => Some(Self::ProviderResponse),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeError {
    pub category: ProbeErrorCategory,
    pub message: String,
}

pub fn classify_legacy_probe_error(message: &str) -> ProbeErrorCategory {
    let normalized = message.trim().to_ascii_lowercase();
    if normalized.starts_with("token expired") || normalized.starts_with("session expired") {
        return ProbeErrorCategory::CredentialExpired;
    }
    if normalized.starts_with("credential unavailable:")
        || normalized.starts_with("credential store unavailable:")
        || normalized.contains("secret store is not accessible")
    {
        return ProbeErrorCategory::CredentialUnavailable;
    }
    if normalized.starts_with("credential read failed:")
        || normalized.starts_with("credentials unreadable:")
    {
        return ProbeErrorCategory::CredentialUnreadable;
    }
    if normalized.starts_with("invalid credential:")
        || normalized.starts_with("invalid token:")
        || normalized.contains("api key invalid")
        || normalized.contains("invalid api key")
        || normalized.contains("token revoked")
    {
        return ProbeErrorCategory::CredentialInvalid;
    }
    if normalized == "provider secret not found"
        || normalized.starts_with("not logged in.")
        || normalized.starts_with("credentials missing:")
        || normalized.contains("api key missing")
        || normalized.contains("token missing")
        || normalized.contains("cookie header missing")
    {
        return ProbeErrorCategory::CredentialMissing;
    }
    if normalized.starts_with("usage response invalid")
        || normalized.starts_with("provider response invalid")
    {
        return ProbeErrorCategory::ProviderResponse;
    }
    ProbeErrorCategory::Unknown
}

#[cfg(test)]
mod tests {
    use super::{ProbeErrorCategory, classify_legacy_probe_error};

    #[test]
    fn legacy_classification_uses_explicit_error_prefixes() {
        assert_eq!(
            classify_legacy_probe_error("provider secret not found"),
            ProbeErrorCategory::CredentialMissing
        );
        assert_eq!(
            classify_legacy_probe_error("credential store unavailable: access denied"),
            ProbeErrorCategory::CredentialUnavailable
        );
        assert_eq!(
            classify_legacy_probe_error("credential read failed: invalid data"),
            ProbeErrorCategory::CredentialUnreadable
        );
        assert_eq!(
            classify_legacy_probe_error("Token expired. Sign in again."),
            ProbeErrorCategory::CredentialExpired
        );
        assert_eq!(
            classify_legacy_probe_error("request access denied by provider"),
            ProbeErrorCategory::Unknown
        );
        assert_eq!(
            classify_legacy_probe_error("Z.ai API key missing. Configure it first."),
            ProbeErrorCategory::CredentialMissing
        );
        assert_eq!(
            classify_legacy_probe_error(
                "Selected account unavailable: secret store is not accessible"
            ),
            ProbeErrorCategory::CredentialUnavailable
        );
    }
}
