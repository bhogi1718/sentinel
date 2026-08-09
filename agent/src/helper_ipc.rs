use serde::{Deserialize, Serialize};
use windows::Win32::Security::SECURITY_ATTRIBUTES;

/// Named pipe the LocalSystem service listens on and the per-session
/// helper connects out to. A LocalSystem process can always create a pipe
/// server; the interactive user's helper process just needs to be able to
/// connect as a client, which the default pipe DACL already permits for
/// same-machine connections from an authenticated user.
pub const PIPE_NAME: &str = r"\\.\pipe\SentinelAgentHelper";

/// Windows' default pipe DACL grants access to any authenticated local
/// user, wider than needed - the helper always runs as whoever is
/// interactively logged in, so the pipe only needs to be reachable by
/// SYSTEM (this server's own process) and the INTERACTIVE well-known
/// group. GA (Generic All) rather than a narrower right because both ends
/// need read+write+FILE_CREATE_PIPE_INSTANCE for reconnect.
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
