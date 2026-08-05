use std::collections::{HashMap, HashSet};

use crate::plugin_engine::runtime::ProviderInstanceRef;

#[derive(Debug, Default)]
pub struct ProbeCoordinator {
    waiting_batches_by_instance: HashMap<ProviderInstanceRef, HashSet<String>>,
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
        instances: &[ProviderInstanceRef],
    ) -> Result<Vec<ProviderInstanceRef>, String> {
        if self.remaining_providers_by_batch.contains_key(&batch_id) {
            return Err(format!("probe batch '{}' is already active", batch_id));
        }
        if instances.is_empty() {
            return Ok(Vec::new());
        }

        self.remaining_providers_by_batch
            .insert(batch_id.clone(), instances.len());
        let mut instances_to_start = Vec::new();
        for instance in instances {
            let waiters = self
                .waiting_batches_by_instance
                .entry(instance.clone())
                .or_default();
            if waiters.is_empty() {
                instances_to_start.push(instance.clone());
            }
            waiters.insert(batch_id.clone());
        }
        Ok(instances_to_start)
    }

    pub fn complete_instance(&mut self, instance: &ProviderInstanceRef) -> ProbeCompletion {
        let mut result_batch_ids: Vec<String> = self
            .waiting_batches_by_instance
            .remove(instance)
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
    use crate::plugin_engine::runtime::ProviderInstanceRef;

    fn instances(values: &[&str]) -> Vec<ProviderInstanceRef> {
        values
            .iter()
            .map(|value| ProviderInstanceRef {
                provider_id: (*value).to_string(),
                instance_id: None,
            })
            .collect()
    }

    #[test]
    fn concurrent_batches_share_provider_work_and_complete_independently() {
        let mut coordinator = ProbeCoordinator::default();

        assert_eq!(
            coordinator
                .reserve_batch("first".to_string(), &instances(&["cursor", "claude"]))
                .unwrap(),
            instances(&["cursor", "claude"])
        );
        assert_eq!(
            coordinator
                .reserve_batch("second".to_string(), &instances(&["cursor"]))
                .unwrap(),
            Vec::<ProviderInstanceRef>::new()
        );

        let cursor = coordinator.complete_instance(&instances(&["cursor"])[0]);
        assert_eq!(cursor.result_batch_ids, ["first", "second"]);
        assert_eq!(cursor.completed_batch_ids, ["second"]);

        let claude = coordinator.complete_instance(&instances(&["claude"])[0]);
        assert_eq!(claude.result_batch_ids, ["first"]);
        assert_eq!(claude.completed_batch_ids, ["first"]);
    }

    #[test]
    fn duplicate_active_batch_ids_are_rejected() {
        let mut coordinator = ProbeCoordinator::default();
        coordinator
            .reserve_batch("same".to_string(), &instances(&["cursor"]))
            .unwrap();

        let error = coordinator
            .reserve_batch("same".to_string(), &instances(&["claude"]))
            .unwrap_err();
        assert!(error.contains("already active"));
    }

    #[test]
    fn different_instances_do_not_share_provider_work() {
        let mut coordinator = ProbeCoordinator::default();
        let profile_a = ProviderInstanceRef {
            provider_id: "codex".to_string(),
            instance_id: Some("profile-a".to_string()),
        };
        let profile_b = ProviderInstanceRef {
            provider_id: "codex".to_string(),
            instance_id: Some("profile-b".to_string()),
        };

        assert_eq!(
            coordinator
                .reserve_batch("first".to_string(), std::slice::from_ref(&profile_a))
                .unwrap(),
            vec![profile_a.clone()]
        );
        assert_eq!(
            coordinator
                .reserve_batch("second".to_string(), std::slice::from_ref(&profile_b))
                .unwrap(),
            vec![profile_b.clone()]
        );
        assert_eq!(
            coordinator.complete_instance(&profile_a).result_batch_ids,
            ["first"]
        );
        assert_eq!(
            coordinator.complete_instance(&profile_b).result_batch_ids,
            ["second"]
        );
    }
}
