use serde::{Deserialize, Serialize};

/// Named pipe the LocalSystem service listens on and the per-session
/// helper connects out to. A LocalSystem process can always create a pipe
/// server; the interactive user's helper process just needs to be able to
/// connect as a client, which the default pipe DACL already permits for
/// same-machine connections from an authenticated user.
pub const PIPE_NAME: &str = r"\\.\pipe\SentinelAgentHelper";

/// One request/response round trip: the service asks "what does the
/// interactive desktop's window list look like right now", the helper
/// (running in the user's own session, with natural desktop access - no
/// Session-0 crossing needed) answers with the PIDs it found. See
/// windows_apps.rs for why this whole companion-process design exists:
/// EnumWindows/OpenInputDesktop cannot be made to work reliably from a
/// LocalSystem service process itself.
#[derive(Debug, Serialize, Deserialize)]
pub struct WindowedPidsResponse {
    pub pids: Vec<u32>,
}
