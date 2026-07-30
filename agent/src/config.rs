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
