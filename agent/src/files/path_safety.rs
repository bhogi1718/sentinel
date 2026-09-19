use std::path::{Component, Path, PathBuf};

/// Resolves a browser-supplied relative path against the configured browse
/// root and refuses anything that would escape it. This is the actual
/// enforcement boundary for the whole file module - the backend does a
/// shallow ".." check too, but the agent must not trust that, since a bug
/// or a compromised backend must not be able to turn this into arbitrary
/// filesystem read access.
///
/// Rejects:
/// - ".." components (parent traversal)
/// - absolute paths / paths with a drive prefix (e.g. "C:\Windows")
/// - paths that canonicalize outside the root (e.g. via a symlink or
///   junction planted inside the root that points elsewhere)
pub fn resolve_within_root(browse_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let root = browse_root
        .canonicalize()
        .map_err(|e| format!("Failed to resolve configured browse_root: {e}"))?;

    let mut candidate = root.clone();
    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(part) => candidate.push(part),
            Component::CurDir => {}
            Component::ParentDir => return Err("Path must not contain '..'".to_string()),
            Component::RootDir | Component::Prefix(_) => {
                return Err("Path must be relative, not absolute".to_string())
            }
        }
    }

    // canonicalize() resolves symlinks/junctions and requires the path to
    // actually exist, which is exactly the guarantee needed here: a
    // relative path that *looks* contained but resolves through a symlink
    // to somewhere outside the root must still be rejected.
    let canonical = candidate
        .canonicalize()
        .map_err(|e| format!("Path not found: {e}"))?;

    if !canonical.starts_with(&root) {
        return Err("Path resolves outside the allowed directory".to_string());
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root() -> PathBuf {
        std::env::temp_dir()
    }

    #[test]
    fn rejects_parent_traversal() {
        let err = resolve_within_root(&test_root(), "sub/../../etc").unwrap_err();
        assert!(err.contains(".."));
    }

    #[test]
    fn rejects_absolute_paths() {
        let err = resolve_within_root(&test_root(), "C:\\Windows").unwrap_err();
        assert!(err.contains("relative"));
    }

    #[test]
    fn accepts_root_itself() {
        let result = resolve_within_root(&test_root(), "");
        assert!(result.is_ok());
    }
}
