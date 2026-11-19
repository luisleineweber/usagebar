use std::fs::OpenOptions;
use std::io;
use std::path::{Path, PathBuf};

/// Replaces `path` with `next` only if its current text equals `expected`.
/// `expected == None` means the file must not exist yet.
///
/// An exclusive lock on the sibling `<name>.lock` file serializes the read,
/// compare, and write across threads and processes. The replacement itself is
/// atomic, so readers that do not take the lock never see a partial file.
pub(crate) fn compare_and_swap(
    path: &Path,
    expected: Option<&str>,
    next: &str,
) -> io::Result<bool> {
    let lock = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(lock_path(path)?)?;
    // `File::lock` is stable since Rust 1.89. CI and release builds pin Rust 1.94.1;
    // clippy.toml keeps an older lint MSRV only for unrelated lint suggestions.
    #[allow(clippy::incompatible_msrv)]
    lock.lock()?;
    let current = match std::fs::read_to_string(path) {
        Ok(text) => Some(text),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    if current.as_deref() != expected {
        return Ok(false);
    }
    crate::atomic_file::write(path, next.as_bytes())?;
    Ok(true)
}

fn lock_path(path: &Path) -> io::Result<PathBuf> {
    let file_name = path.file_name().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "compare-and-swap destination must have a file name",
        )
    })?;
    let mut lock_name = file_name.to_os_string();
    lock_name.push(".lock");
    Ok(path.with_file_name(lock_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("usagebar-cas-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn swaps_only_when_the_text_is_unchanged() {
        let dir = temp_dir();
        let path = dir.join("state.json");

        assert!(compare_and_swap(&path, None, "a").expect("create"));
        assert!(!compare_and_swap(&path, None, "b").expect("exists"));
        assert!(!compare_and_swap(&path, Some("stale"), "b").expect("stale"));
        assert_eq!(std::fs::read_to_string(&path).expect("read"), "a");
        assert!(compare_and_swap(&path, Some("a"), "b").expect("swap"));
        assert_eq!(std::fs::read_to_string(&path).expect("read"), "b");

        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn concurrent_read_decide_write_loses_no_update() {
        let dir = temp_dir();
        let path = dir.join("counter.json");
        let threads = 8;
        let increments = 25;

        std::thread::scope(|scope| {
            for _ in 0..threads {
                scope.spawn(|| {
                    for _ in 0..increments {
                        loop {
                            let current = std::fs::read_to_string(&path).ok();
                            let value: u32 = current
                                .as_deref()
                                .map_or(0, |text| text.parse().expect("counter"));
                            let next = (value + 1).to_string();
                            if compare_and_swap(&path, current.as_deref(), &next).expect("cas") {
                                break;
                            }
                        }
                    }
                });
            }
        });

        assert_eq!(
            std::fs::read_to_string(&path).expect("read"),
            (threads * increments).to_string()
        );
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
