//! Account keys scope cached data to the signed-in provider account.
//!
//! A plugin reports a stable account identifier as `accountKey`. The host keeps only a
//! SHA-256 digest of it, so the raw identifier never reaches the cache, the frontend,
//! the local HTTP API, or the logs.

use sha2::{Digest, Sha256};

const MAX_RAW_ACCOUNT_KEY_LEN: usize = 512;

/// Returns the digest for a trimmed, non-empty identifier of at most 512 bytes.
pub(crate) fn hash_account_key(provider_id: &str, raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > MAX_RAW_ACCOUNT_KEY_LEN {
        return None;
    }
    let mut hasher = Sha256::new();
    hasher.update(b"usagebar-account-key\0");
    hasher.update(provider_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(raw.as_bytes());
    Some(
        hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_are_stable_scoped_and_do_not_contain_the_raw_value() {
        let key = hash_account_key("cursor", " user_abc123 ").expect("key");
        assert_eq!(key.len(), 64);
        assert!(!key.contains("user_abc123"));
        assert_eq!(hash_account_key("cursor", "user_abc123"), Some(key.clone()));
        assert_ne!(hash_account_key("cursor", "user_other"), Some(key.clone()));
        assert_ne!(hash_account_key("claude", "user_abc123"), Some(key));
    }

    #[test]
    fn rejects_empty_and_oversized_values() {
        assert_eq!(hash_account_key("cursor", "  "), None);
        assert_eq!(hash_account_key("cursor", &"a".repeat(513)), None);
        assert!(hash_account_key("cursor", &"a".repeat(512)).is_some());
    }
}
