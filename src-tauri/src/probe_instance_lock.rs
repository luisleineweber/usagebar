//! One running probe per provider instance.
//!
//! A probe worker that exceeds its timeout keeps running on its blocking thread, because a
//! blocking host call cannot be cancelled. The probe coordinator still releases the instance, so a
//! later batch could start a second probe of the same instance. Both probes would then read and
//! write the same plugin data, such as rate-limit holds. The guard from `acquire` lives as long as
//! the worker itself, so the next probe of that instance starts only after the earlier worker ends.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

use crate::plugin_engine::runtime::ProviderInstanceRef;

type InstanceLocks = Mutex<HashMap<ProviderInstanceRef, Arc<AsyncMutex<()>>>>;

fn instance_locks() -> &'static InstanceLocks {
    static LOCKS: OnceLock<InstanceLocks> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Waits up to `timeout` until no other probe of `instance` runs. Returns `None` when an earlier
/// probe of that instance is still running after the wait.
pub(crate) async fn acquire(
    instance: &ProviderInstanceRef,
    timeout: Duration,
) -> Option<OwnedMutexGuard<()>> {
    let lock = {
        let mut locks = instance_locks()
            .lock()
            .expect("probe instance lock map poisoned");
        Arc::clone(locks.entry(instance.clone()).or_default())
    };
    tokio::time::timeout(timeout, lock.lock_owned()).await.ok()
}

#[cfg(test)]
mod tests {
    use super::acquire;
    use crate::plugin_engine::runtime::ProviderInstanceRef;
    use std::time::Duration;

    fn instance(provider_id: &str, instance_id: &str) -> ProviderInstanceRef {
        ProviderInstanceRef {
            provider_id: provider_id.to_string(),
            instance_id: Some(instance_id.to_string()),
        }
    }

    #[tokio::test]
    async fn a_running_probe_blocks_only_its_own_instance() {
        let short = Duration::from_millis(20);
        let held = acquire(&instance("claude", "lock-test-a"), short)
            .await
            .expect("first probe starts");

        assert!(
            acquire(&instance("claude", "lock-test-a"), short)
                .await
                .is_none()
        );
        assert!(
            acquire(&instance("claude", "lock-test-b"), short)
                .await
                .is_some()
        );

        drop(held);
        assert!(
            acquire(&instance("claude", "lock-test-a"), short)
                .await
                .is_some()
        );
    }

    #[tokio::test]
    async fn a_waiting_probe_starts_when_the_running_worker_ends() {
        let held = acquire(
            &instance("claude", "lock-test-c"),
            Duration::from_millis(20),
        )
        .await
        .expect("first probe starts");
        let release = tokio::task::spawn_blocking(move || {
            std::thread::sleep(Duration::from_millis(50));
            drop(held);
        });

        assert!(
            acquire(&instance("claude", "lock-test-c"), Duration::from_secs(5))
                .await
                .is_some()
        );
        release.await.expect("worker ends");
    }
}
