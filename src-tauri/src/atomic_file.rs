use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Atomically replace `path` with `contents` using a temporary file in the
/// destination directory.
pub(crate) fn write(path: &Path, contents: &[u8]) -> io::Result<()> {
    let temp_path = temp_path_for(path)?;
    write_and_replace(&temp_path, path, contents)
}

fn temp_path_for(path: &Path) -> io::Result<PathBuf> {
    let file_name = path.file_name().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "atomic write destination must have a file name",
        )
    })?;
    let temp_name = format!(
        ".{}.{}.tmp",
        file_name.to_string_lossy(),
        uuid::Uuid::new_v4()
    );
    Ok(path.with_file_name(temp_name))
}

fn write_and_replace(temp_path: &Path, destination: &Path, contents: &[u8]) -> io::Result<()> {
    let mut temp = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temp_path)?;
    let write_result = temp.write_all(contents).and_then(|()| temp.sync_all());
    drop(temp);

    if let Err(error) = write_result {
        let _ = std::fs::remove_file(temp_path);
        return Err(error);
    }

    let replace_result = replace(temp_path, destination);
    if replace_result.is_err() {
        let _ = std::fs::remove_file(temp_path);
    }
    replace_result
}

#[cfg(target_os = "windows")]
fn replace(temp_path: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let temp_path: Vec<u16> = temp_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;
    let moved = unsafe { MoveFileExW(temp_path.as_ptr(), destination.as_ptr(), flags) };
    if moved == 0 {
        return Err(io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace(temp_path: &Path, destination: &Path) -> io::Result<()> {
    std::fs::rename(temp_path, destination)
}

#[cfg(test)]
mod tests {
    use super::write;
    use std::path::Path;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "usagebar-atomic-file-{name}-{}",
            uuid::Uuid::new_v4()
        ))
    }

    #[test]
    fn writes_new_file() {
        let dir = temp_dir("new");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("state.json");

        write(&path, br#"{"version":1}"#).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), br#"{"version":1}"#);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn replaces_existing_file() {
        let dir = temp_dir("replace");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("state.json");
        std::fs::write(&path, b"old").unwrap();

        write(&path, b"new").unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_destination_without_file_name() {
        let error = write(Path::new(""), b"value").unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput);
    }
}
