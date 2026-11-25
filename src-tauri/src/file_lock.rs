//! OS locks compatible with the repository MSRV. Lock files contain no secrets.
use std::fs::{File, OpenOptions};
use std::path::Path;

pub(crate) fn exclusive(path: &Path, wait: bool) -> Result<Option<File>, String> {
    let parent = path.parent().ok_or("Invalid credential lock path")?;
    std::fs::create_dir_all(parent).map_err(|_| "Could not create credential lock directory")?;
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|_| "Could not open credential lock")?;
    if wait {
        fs4::fs_std::FileExt::lock_exclusive(&file)
            .map_err(|_| "Could not lock credential store")?;
    } else if !fs4::fs_std::FileExt::try_lock_exclusive(&file)
        .map_err(|_| "Could not lock credential chain")?
    {
        return Ok(None);
    }
    Ok(Some(file))
}
