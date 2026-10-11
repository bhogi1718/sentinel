use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct Config {
    pub server_url: String,
    pub device_token: String,
    #[serde(default = "default_battery_low_threshold")]
    pub battery_low_threshold: u8,
    #[serde(default = "default_network_check_interval_secs")]
    pub network_check_interval_secs: u64,
    /// File browsing is confined to this directory (and everything under
    /// it). Configured explicitly rather than read from the USERPROFILE
    /// environment variable, because the agent runs as a Windows Service
    /// under LocalSystem - its own USERPROFILE points at the SYSTEM
    /// profile, not the interactive user's actual home directory.
    pub browse_root: String,
    /// Whether the per-session helper shows the on-screen "being viewed"
    /// banner during a live view. Defaults to true (shown). The device
    /// owner can set this to false to suppress it. Read by the helper
    /// directly from agent.toml; present here so the schema is complete and
    /// `toml::from_str` for the service doesn't treat it as unknown.
    #[serde(default = "default_show_view_indicator")]
    pub show_view_indicator: bool,
}

fn default_show_view_indicator() -> bool {
    true
}

fn default_battery_low_threshold() -> u8 {
    15
}

fn default_network_check_interval_secs() -> u64 {
    15
}

impl Config {
    pub fn load(path: &Path) -> Result<Self, String> {
        let contents = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read config file at {}: {e}", path.display()))?;
        toml::from_str(&contents).map_err(|e| format!("Failed to parse config file: {e}"))
    }
}
