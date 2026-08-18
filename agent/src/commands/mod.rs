pub mod executor;

use serde::Deserialize;

/// KillProcess carries a target PID + the name the dashboard displayed for
/// it, so the executor can re-verify the PID still belongs to that process
/// right before terminating it (see processes::kill_process's doc comment
/// for why - the dashboard's view is always a few seconds stale by the
/// time a command round-trips back here). That payload is why this can no
/// longer be a plain data-free, Copy enum the way it used to be.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CommandType {
    Lock,
    Restart,
    Shutdown,
    Sleep,
    LogOff,
    KillProcess { pid: u32, name: String },
}

#[derive(Debug, Deserialize)]
pub struct CommandRequest {
    #[serde(rename = "commandId")]
    pub command_id: String,
    #[serde(flatten)]
    pub command_type: CommandType,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_a_simple_command_without_a_payload() {
        let json = r#"{"commandId": "abc-123", "type": "LOCK"}"#;
        let request: CommandRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.command_id, "abc-123");
        assert_eq!(request.command_type, CommandType::Lock);
    }

    #[test]
    fn deserializes_a_kill_process_command_with_its_pid_and_name() {
        let json = r#"{"commandId": "abc-123", "type": "KILL_PROCESS", "pid": 4821, "name": "chrome.exe"}"#;
        let request: CommandRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.command_id, "abc-123");
        assert_eq!(request.command_type, CommandType::KillProcess { pid: 4821, name: "chrome.exe".to_string() });
    }
}
