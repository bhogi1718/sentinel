pub mod path_safety;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct FileListRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct FileDownloadRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    name: String,
    #[serde(rename = "isDirectory")]
    is_directory: bool,
    #[serde(rename = "sizeBytes")]
    size_bytes: u64,
    #[serde(rename = "modifiedAt")]
    modified_at: String,
}

pub fn list_directory(browse_root: &Path, relative_path: &str) -> Result<Vec<FileEntry>, String> {
    let target = path_safety::resolve_within_root(browse_root, relative_path)?;

    if !target.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let read_dir = std::fs::read_dir(&target).map_err(|e| format!("Failed to read directory: {e}"))?;

    let mut entries = Vec::new();
    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            // A file can disappear or become inaccessible between listing
            // the directory and stat-ing this entry - skip it rather than
            // failing the whole listing over one transient entry.
            Err(_) => continue,
        };

        let modified_at: DateTime<Utc> = metadata
            .modified()
            .map(DateTime::<Utc>::from)
            .unwrap_or_else(|_| Utc::now());

        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_directory: metadata.is_dir(),
            size_bytes: if metadata.is_dir() { 0 } else { metadata.len() },
            modified_at: modified_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        });
    }

    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Resolves a requested download path and opens it, returning the open
/// handle on success or an error describing why it can't be served.
/// Deliberately opens the file in the same call that validates its path -
/// splitting "validate" and "open" into two separate steps would leave a
/// TOCTOU window where a symlink swapped into browse_root between the two
/// could redirect the open to a target outside the validated root.
pub fn resolve_and_open_download(browse_root: &Path, relative_path: &str) -> Result<std::fs::File, String> {
    let target = path_safety::resolve_within_root(browse_root, relative_path)?;

    if !target.is_file() {
        return Err("Path is not a file".to_string());
    }

    std::fs::File::open(&target).map_err(|e| format!("Failed to open file: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn unique_test_root() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("sentinel-files-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolve_and_open_download_reads_file_contents() {
        let root = unique_test_root();
        let file_path = root.join("hello.txt");
        std::fs::write(&file_path, b"hello world").unwrap();

        let mut file = resolve_and_open_download(&root, "hello.txt").expect("should open");
        let mut contents = String::new();
        file.read_to_string(&mut contents).unwrap();
        assert_eq!(contents, "hello world");

        let _ = std::fs::remove_file(&file_path);
    }

    #[test]
    fn resolve_and_open_download_rejects_directories() {
        let root = unique_test_root();
        let subdir = root.join("a-directory");
        std::fs::create_dir_all(&subdir).unwrap();

        let err = resolve_and_open_download(&root, "a-directory").unwrap_err();
        assert!(err.contains("not a file"));
    }

    #[test]
    fn resolve_and_open_download_rejects_traversal() {
        let root = unique_test_root();
        let err = resolve_and_open_download(&root, "../../etc/passwd").unwrap_err();
        assert!(err.contains(".."));
    }

    #[test]
    fn list_directory_reports_written_bytes() {
        let root = unique_test_root();
        let mut file = std::fs::File::create(root.join("sized.bin")).unwrap();
        file.write_all(&[0u8; 42]).unwrap();
        drop(file);

        let entries = list_directory(&root, "").expect("should list");
        let entry = entries.iter().find(|e| e.name == "sized.bin").expect("entry present");
        assert_eq!(entry.size_bytes, 42);
        assert!(!entry.is_directory);
    }
}
