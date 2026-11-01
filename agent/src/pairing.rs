//! `sentinel-agent pair <CODE> --server <URL> [--config <PATH>]`
//!
//! Exchanges a pairing code (created by an Owner or Admin in the dashboard)
//! for this device's token, and writes it - with the server URL - into
//! agent.toml. Nobody copies the long-lived token by hand: it goes straight
//! from the backend into the config file the service reads. install-service.ps1
//! runs this when given -PairingCode.

use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use toml_edit::{value, DocumentMut};

/// Same alphabet the backend draws codes from (no 0/O, 1/I/L).
const CODE_ALPHABET: &str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH: usize = 8;

/// The backend is on a free tier that sleeps when idle; the first request
/// after a nap can take most of a minute to answer.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Debug, PartialEq)]
struct PairArgs {
    code: String,
    server_url: String,
    config_path: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Paired {
    device_id: String,
    device_name: String,
    token: String,
}

#[derive(Debug, Deserialize)]
struct ApiSuccess {
    data: Paired,
}

#[derive(Debug, Deserialize)]
struct ApiFailure {
    error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    message: String,
}

/// A code as typed - any case, with or without the dash, with spaces -
/// reduced to its 8 characters, or None if it can't be one.
fn normalize_code(raw: &str) -> Option<String> {
    let code: String = raw
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();
    let valid = code.chars().count() == CODE_LENGTH && code.chars().all(|c| CODE_ALPHABET.contains(c));
    valid.then_some(code)
}

fn parse_args(args: &[String]) -> Result<PairArgs, String> {
    let mut code = None;
    let mut server_url = None;
    let mut config_path = None;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--server" => server_url = Some(iter.next().ok_or("--server needs a URL")?.clone()),
            "--config" => config_path = Some(PathBuf::from(iter.next().ok_or("--config needs a path")?)),
            other if other.starts_with("--") => return Err(format!("Unknown option {other}")),
            other if code.is_none() => code = Some(other.to_string()),
            other => return Err(format!("Unexpected argument {other}")),
        }
    }

    let raw_code = code.ok_or("Missing the pairing code")?;
    let code = normalize_code(&raw_code).ok_or_else(|| format!("{raw_code} isn't a valid pairing code (it looks like K7QM-3XRP)"))?;
    let server_url = server_url.ok_or("Missing --server <URL> (the Sentinel backend, e.g. https://your-backend.onrender.com)")?;
    let server_url = server_url.trim_end_matches('/').to_string();
    if !(server_url.starts_with("https://") || server_url.starts_with("http://")) {
        return Err(format!("{server_url} isn't an http(s) URL"));
    }
    Ok(PairArgs { code, server_url, config_path })
}

async fn claim(server_url: &str, code: &str) -> Result<Paired, String> {
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("Couldn't set up HTTPS: {e}"))?;
    let response = client
        .post(format!("{server_url}/api/agent/pair"))
        .json(&serde_json::json!({ "code": code }))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach {server_url}: {e}"))?;

    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Couldn't read the server's answer: {e}"))?;
    if status.is_success() {
        return serde_json::from_str::<ApiSuccess>(&body)
            .map(|ok| ok.data)
            .map_err(|e| format!("Unexpected answer from the server: {e}"));
    }
    let message = serde_json::from_str::<ApiFailure>(&body)
        .map(|failure| failure.error.message)
        .unwrap_or_else(|_| format!("the server answered {status}"));
    Err(format!("Pairing failed: {message}"))
}

/// Writes `server_url` and `device_token` into the config at `path`,
/// keeping every other setting and comment. A missing file is created, with
/// `browse_root` set to `default_browse_root` (the user's profile) - the one
/// other setting the agent can't start without.
fn write_config(path: &Path, server_url: &str, token: &str, default_browse_root: Option<&str>) -> Result<(), String> {
    let existing = match std::fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("Couldn't read {}: {e}", path.display())),
    };
    let mut doc: DocumentMut = existing
        .parse()
        .map_err(|e| format!("{} isn't valid TOML: {e}", path.display()))?;

    doc["server_url"] = value(server_url);
    doc["device_token"] = value(token);
    if !doc.contains_key("browse_root") {
        match default_browse_root {
            Some(root) => doc["browse_root"] = value(root),
            None => return Err("agent.toml has no browse_root, and the user profile folder is unknown".into()),
        }
    }

    std::fs::write(path, doc.to_string()).map_err(|e| format!("Couldn't write {}: {e}", path.display()))
}

fn default_config_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("agent.toml")))
        .unwrap_or_else(|| PathBuf::from("agent.toml"))
}

/// Entry point for `sentinel-agent pair ...` (`args` excludes "pair").
/// Returns the process exit code.
pub fn run(args: &[String]) -> i32 {
    let parsed = match parse_args(args) {
        Ok(parsed) => parsed,
        Err(e) => {
            eprintln!("{e}");
            eprintln!("Usage: sentinel-agent pair <CODE> --server <URL> [--config <PATH>]");
            return 2;
        }
    };
    let config_path = parsed.config_path.clone().unwrap_or_else(default_config_path);

    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(e) => {
            eprintln!("Couldn't start: {e}");
            return 1;
        }
    };
    println!("Pairing with {} ...", parsed.server_url);
    let paired = match runtime.block_on(claim(&parsed.server_url, &parsed.code)) {
        Ok(paired) => paired,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };

    let profile = std::env::var("USERPROFILE").ok();
    if let Err(e) = write_config(&config_path, &parsed.server_url, &paired.token, profile.as_deref()) {
        eprintln!("Paired as {}, but {e}", paired.device_name);
        eprintln!("The pairing code is now used up - create a new one in the dashboard and try again.");
        return 1;
    }
    println!(
        "Paired as \"{}\" (device {}). Saved to {}.",
        paired.device_name,
        paired.device_id,
        config_path.display()
    );
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn normalizes_codes_however_they_are_typed() {
        assert_eq!(normalize_code("K7QM-3XRP").as_deref(), Some("K7QM3XRP"));
        assert_eq!(normalize_code(" k7qm 3xrp ").as_deref(), Some("K7QM3XRP"));
        assert_eq!(normalize_code("k7qm3xrp").as_deref(), Some("K7QM3XRP"));
    }

    #[test]
    fn rejects_codes_outside_the_alphabet_or_length() {
        assert_eq!(normalize_code("OOOO-1111"), None);
        assert_eq!(normalize_code("K7QM-3XR"), None);
        assert_eq!(normalize_code("K7QM-3XRPP"), None);
        assert_eq!(normalize_code(""), None);
    }

    #[test]
    fn parses_code_server_and_config() {
        let parsed = parse_args(&args(&["k7qm-3xrp", "--server", "https://api.example.com/", "--config", "C:\\a\\agent.toml"])).unwrap();
        assert_eq!(
            parsed,
            PairArgs {
                code: "K7QM3XRP".into(),
                server_url: "https://api.example.com".into(),
                config_path: Some(PathBuf::from("C:\\a\\agent.toml")),
            }
        );
    }

    #[test]
    fn requires_a_server_url() {
        assert!(parse_args(&args(&["K7QM-3XRP"])).unwrap_err().contains("--server"));
        assert!(parse_args(&args(&["K7QM-3XRP", "--server", "ftp://x"])).is_err());
    }

    fn temp_config(name: &str, contents: Option<&str>) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sentinel-pairing-test-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("agent.toml");
        let _ = std::fs::remove_file(&path);
        if let Some(contents) = contents {
            std::fs::write(&path, contents).unwrap();
        }
        path
    }

    #[test]
    fn keeps_other_settings_and_comments_when_updating() {
        let path = temp_config(
            "update",
            Some("# my laptop\nserver_url = \"http://old\"\ndevice_token = \"old\"\nbrowse_root = 'C:\\Users\\me'\nbattery_low_threshold = 20 # warn early\n"),
        );

        write_config(&path, "https://new.example.com", "newtoken", Some("C:\\Users\\other")).unwrap();

        let written = std::fs::read_to_string(&path).unwrap();
        assert!(written.contains("# my laptop"));
        assert!(written.contains("battery_low_threshold = 20 # warn early"));
        assert!(written.contains("browse_root = 'C:\\Users\\me'"));
        let doc: DocumentMut = written.parse().unwrap();
        assert_eq!(doc["server_url"].as_str(), Some("https://new.example.com"));
        assert_eq!(doc["device_token"].as_str(), Some("newtoken"));
    }

    #[test]
    fn creates_a_config_with_the_profile_as_browse_root() {
        let path = temp_config("create", None);

        write_config(&path, "https://api.example.com", "tok", Some("C:\\Users\\me")).unwrap();

        let doc: DocumentMut = std::fs::read_to_string(&path).unwrap().parse().unwrap();
        assert_eq!(doc["server_url"].as_str(), Some("https://api.example.com"));
        assert_eq!(doc["device_token"].as_str(), Some("tok"));
        assert_eq!(doc["browse_root"].as_str(), Some("C:\\Users\\me"));
    }

    #[test]
    fn refuses_to_write_a_config_without_any_browse_root() {
        let path = temp_config("no-root", None);
        assert!(write_config(&path, "https://api.example.com", "tok", None).is_err());
    }
}
