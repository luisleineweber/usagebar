pub(crate) fn push_approved_cookie(
    seen: &mut std::collections::HashMap<String, String>,
    pairs: &mut Vec<String>,
    name: &str,
    value: &str,
) -> Result<(), String> {
    if let Some(existing) = seen.get(name) {
        if existing != value {
            return Err(format!(
                "guided login found conflicting values for approved cookie '{}'",
                name
            ));
        }
        return Ok(());
    }
    seen.insert(name.to_string(), value.to_string());
    pairs.push(format!("{}={}", name, value));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::push_approved_cookie;

    #[test]
    fn approved_cookie_accumulator_deduplicates_and_rejects_conflicts() {
        let mut seen = std::collections::HashMap::new();
        let mut pairs = Vec::new();
        push_approved_cookie(&mut seen, &mut pairs, "session", "first").expect("first");
        push_approved_cookie(&mut seen, &mut pairs, "session", "first").expect("duplicate");
        assert_eq!(pairs, vec!["session=first"]);

        let error = push_approved_cookie(&mut seen, &mut pairs, "session", "second")
            .expect_err("conflicting values must fail");
        assert!(error.contains("conflicting values"));
    }
}
