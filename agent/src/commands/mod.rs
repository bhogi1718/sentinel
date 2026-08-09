pub mod executor;

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CommandType {
    Lock,
    Restart,
    Shutdown,
    Sleep,
    LogOff,
}

#[derive(Debug, Deserialize)]
pub struct CommandRequest {
    #[serde(rename = "commandId")]
    pub command_id: String,
    #[serde(rename = "type")]
    pub command_type: CommandType,
}
