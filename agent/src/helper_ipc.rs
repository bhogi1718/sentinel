use serde::{Deserialize, Serialize};
use std::io::Write;
use std::time::Duration;
use windows::Win32::Security::SECURITY_ATTRIBUTES;

/// Named pipe the per-session helper (helper_main.rs) listens on as a pipe
/// server, and the LocalSystem service (this binary, processes/mod.rs and
/// screenshot/mod.rs) connects to as a client. It has to be this way round
/// even though the service runs with far higher privilege: creating/owning
/// a named pipe server needs no special session access, but only a process
/// actually running *inside* the interactive session (the helper) can reach
/// that session's desktop for window enumeration or screen capture - a
/// LocalSystem service has no desktop of its own to answer from (see
/// windows_apps.rs for why). So the low-privilege, session-bound process is
/// the server here, and the high-privilege, session-less service is the
/// client reaching out to it.
pub const PIPE_NAME: &str = r"\\.\pipe\SentinelAgentHelper";

/// Windows' default pipe DACL grants access to any authenticated local
/// user, wider than needed - the pipe only needs to be reachable by SYSTEM
/// (the service, which connects in as a client) and the INTERACTIVE
/// well-known group (the helper, which creates/owns the pipe server as
/// whoever is interactively logged in). GA (Generic All) rather than a
/// narrower right because both ends need read+write+FILE_CREATE_PIPE_INSTANCE
/// for reconnect.
pub const PIPE_SECURITY_DESCRIPTOR_SDDL: &str = "D:(A;;GA;;;SY)(A;;GA;;;IU)";

/// Builds the win32 security attributes for
/// `create_with_security_attributes_raw`, scoped to
/// [`PIPE_SECURITY_DESCRIPTOR_SDDL`]. Returned handles/buffers must outlive
/// the pipe-create call that consumes the raw pointer.
pub struct PipeSecurityAttributes {
    descriptor: windows::Win32::Security::PSECURITY_DESCRIPTOR,
    attributes: windows::Win32::Security::SECURITY_ATTRIBUTES,
}

impl PipeSecurityAttributes {
    pub fn build() -> windows::core::Result<Self> {
        use windows::core::PCWSTR;
        use windows::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
        use windows::Win32::Security::PSECURITY_DESCRIPTOR;

        let sddl_wide: Vec<u16> = PIPE_SECURITY_DESCRIPTOR_SDDL
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                PCWSTR(sddl_wide.as_ptr()),
                windows::Win32::Security::Authorization::SDDL_REVISION_1,
                &mut descriptor,
                None,
            )?;
        }

        let attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor.0,
            bInheritHandle: false.into(),
        };

        Ok(Self { descriptor, attributes })
    }

    pub fn as_ptr(&self) -> *mut std::ffi::c_void {
        &self.attributes as *const SECURITY_ATTRIBUTES as *mut std::ffi::c_void
    }
}

impl Drop for PipeSecurityAttributes {
    fn drop(&mut self) {
        if !self.descriptor.0.is_null() {
            unsafe {
                let freed = windows::Win32::Foundation::LocalFree(windows::Win32::Foundation::HLOCAL(self.descriptor.0));
                debug_assert!(freed.0.is_null(), "LocalFree should return NULL on success");
            }
        }
    }
}

/// What the service is asking the helper to do. The client writes one of
/// these (JSON, newline-terminated) before reading a response - originally
/// the pipe only ever answered one fixed question (windowed PIDs) so no
/// request payload was needed at all, but adding a second capability
/// (screenshots) means the helper now needs to be told which one a given
/// connection wants.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HelperRequest {
    WindowedPids,
    Screenshot,
}

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

/// Screenshot responses are framed as `[4-byte little-endian header
/// length][JSON header][raw PNG bytes]` rather than JSON-with-embedded-
/// base64: a captured desktop is commonly several hundred KB to a few MB,
/// and base64 both inflates that by a third and forces a full extra copy
/// to encode/decode. The header carries only metadata; PNG bytes follow it
/// as-is on the wire.
#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenshotHeader {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub png_byte_len: u32,
}

/// Writes a request as newline-terminated JSON - the wire format
/// helper_main.rs's `read_request` expects. Shared by every synchronous
/// pipe client (processes/mod.rs, screenshot/mod.rs) so the framing logic
/// exists in exactly one place.
pub fn write_request(pipe: &mut impl Write, request: &HelperRequest) -> std::io::Result<()> {
    let mut line = serde_json::to_vec(request)?;
    line.push(b'\n');
    pipe.write_all(&line)
}

/// Runs `f` on a dedicated thread and waits at most `timeout` for it to
/// finish, returning `None` on timeout.
///
/// Exists because talking to the helper over the pipe (`std::fs::File`'s
/// blocking `read`/`write`) has no built-in timeout of any kind: Windows
/// named-pipe reads in byte/blocking mode block until data arrives or the
/// pipe handle is closed, with no way to attach a deadline via the
/// synchronous std API. Once `OpenOptions::open` succeeds (the helper *is*
/// running and accepted the connection), everything after that point -
/// `write_request`, `read_to_end`/`read_exact` - can hang forever if the
/// helper then never responds and never closes its end: e.g. it is wedged
/// mid-request, or its session went non-interactive (a logoff, an RDP
/// session switch, Fast User Switching) partway through a desktop/GDI call
/// that itself has no timeout. Without this wrapper that hang propagates
/// all the way up through `tokio::task::spawn_blocking` to the async
/// handler awaiting it in socket_client.rs, and from there - since every
/// socket.io event callback runs inline on the single task that drives the
/// whole connection's packet stream - to freezing the entire agent
/// (metrics, commands, reconnect-on-disconnect, everything) while the
/// Windows Service itself stays reported as "Running".
///
/// On timeout, `f`'s thread is simply abandoned: it keeps running, still
/// pinned to whatever blocking call it's stuck in, and its eventual result
/// (if any) is silently dropped when the channel send fails. That's a
/// bounded, rare per-call thread leak - one OS thread sitting idle in a
/// pipe read until the helper process is eventually restarted or killed -
/// which is a small price for guaranteeing the *caller* never blocks past
/// `timeout` no matter how badly the helper misbehaves.
pub fn run_with_timeout<T, F>(timeout: Duration, f: F) -> Option<T>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        // Errors only if the receiver already timed out and was dropped -
        // nothing to do at that point, the result is simply discarded.
        let _ = tx.send(f());
    });
    rx.recv_timeout(timeout).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_with_timeout_returns_the_result_when_the_closure_finishes_in_time() {
        let result = run_with_timeout(Duration::from_secs(1), || 42);
        assert_eq!(result, Some(42));
    }

    #[test]
    fn run_with_timeout_bounds_a_closure_that_never_returns() {
        // Simulates exactly the bug this exists to prevent: a helper-pipe
        // read that blocks forever because the helper accepted the
        // connection but then never responded (see fetch_windowed_pids /
        // capture_screenshot). Before this wrapper existed, that call had
        // no way to bound itself at all - the caller, and transitively the
        // entire agent's socket.io connection (see socket_client.rs's
        // `connect()` doc comment for why), would hang right along with it.
        let start = std::time::Instant::now();
        let result: Option<()> = run_with_timeout(Duration::from_millis(200), || {
            std::thread::sleep(Duration::from_secs(3600));
        });
        assert_eq!(result, None);
        assert!(
            start.elapsed() < Duration::from_secs(2),
            "run_with_timeout took {:?}, expected it to return promptly after its 200ms timeout",
            start.elapsed(),
        );
    }
}
