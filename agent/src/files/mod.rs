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

/// Resolves a requested download path, returning the real file path on
/// success or an error describing why it can't be served. Kept separate
/// from the actual chunked-read loop (in socket_client.rs) so path safety
/// is exercised the same way listing is, before any file handle is opened.
pub fn resolve_download_path(browse_root: &Path, relative_path: &str) -> Result<std::path::PathBuf, String> {
    let target = path_safety::resolve_within_root(browse_root, relative_path)?;

    if !target.is_file() {
        return Err("Path is not a file".to_string());
    }

    Ok(target)
}
