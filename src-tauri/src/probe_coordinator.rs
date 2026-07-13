use std::collections::{HashMap, HashSet};

#[derive(Debug, Default)]
pub struct ProbeCoordinator {
    waiting_batches_by_provider: HashMap<String, HashSet<String>>,
    remaining_providers_by_batch: HashMap<String, usize>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ProbeCompletion {
    pub result_batch_ids: Vec<String>,
    pub completed_batch_ids: Vec<String>,
}

impl ProbeCoordinator {
    pub fn reserve_batch(
        &mut self,
        batch_id: String,
        provider_ids: &[String],
    ) -> Result<Vec<String>, String> {
        if self.remaining_providers_by_batch.contains_key(&batch_id) {
            return Err(format!("probe batch '{}' is already active", batch_id));
        }
        if provider_ids.is_empty() {
            return Ok(Vec::new());
        }

        self.remaining_providers_by_batch
            .insert(batch_id.clone(), provider_ids.len());
        let mut providers_to_start = Vec::new();
        for provider_id in provider_ids {
            let waiters = self
                .waiting_batches_by_provider
                .entry(provider_id.clone())
                .or_default();
            if waiters.is_empty() {
                providers_to_start.push(provider_id.clone());
            }
            waiters.insert(batch_id.clone());
        }
        Ok(providers_to_start)
    }

    pub fn complete_provider(&mut self, provider_id: &str) -> ProbeCompletion {
        let mut result_batch_ids: Vec<String> = self
            .waiting_batches_by_provider
            .remove(provider_id)
            .unwrap_or_default()
            .into_iter()
            .collect();
        result_batch_ids.sort();

        let mut completed_batch_ids = Vec::new();
        for batch_id in &result_batch_ids {
            let Some(remaining) = self.remaining_providers_by_batch.get_mut(batch_id) else {
                continue;
            };
            *remaining = remaining.saturating_sub(1);
            if *remaining == 0 {
                completed_batch_ids.push(batch_id.clone());
            }
        }
        for batch_id in &completed_batch_ids {
            self.remaining_providers_by_batch.remove(batch_id);
        }
        completed_batch_ids.sort();

        ProbeCompletion {
            result_batch_ids,
            completed_batch_ids,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ProbeCoordinator;

    fn ids(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn concurrent_batches_share_provider_work_and_complete_independently() {
        let mut coordinator = ProbeCoordinator::default();

        assert_eq!(
            coordinator
                .reserve_batch("first".to_string(), &ids(&["cursor", "claude"]))
                .unwrap(),
            ids(&["cursor", "claude"])
        );
        assert_eq!(
            coordinator
                .reserve_batch("second".to_string(), &ids(&["cursor"]))
                .unwrap(),
            Vec::<String>::new()
        );

        let cursor = coordinator.complete_provider("cursor");
        assert_eq!(cursor.result_batch_ids, ids(&["first", "second"]));
        assert_eq!(cursor.completed_batch_ids, ids(&["second"]));

        let claude = coordinator.complete_provider("claude");
        assert_eq!(claude.result_batch_ids, ids(&["first"]));
        assert_eq!(claude.completed_batch_ids, ids(&["first"]));
    }

    #[test]
    fn duplicate_active_batch_ids_are_rejected() {
        let mut coordinator = ProbeCoordinator::default();
        coordinator
            .reserve_batch("same".to_string(), &ids(&["cursor"]))
            .unwrap();

        let error = coordinator
            .reserve_batch("same".to_string(), &ids(&["claude"]))
            .unwrap_err();
        assert!(error.contains("already active"));
    }
}
