use serde::Deserialize;
use std::io::Read;
use std::time::Duration;

use crate::helper_ipc::{write_request, HelperRequest, ScreenshotHeader, PIPE_NAME};

#[derive(Debug, Deserialize)]
pub struct ScreenshotRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
}

/// How long to wait for the per-session helper to respond before giving up.
/// Capture itself is fast (a single BitBlt + PNG encode), but the helper
/// might not be running at all (no one logged in yet) - bounded the same
/// way fetch_windowed_pids is, so a missing helper can't hang the request
/// indefinitely.
const HELPER_TIMEOUT: Duration = Duration::from_secs(10);

/// Requests a full-virtual-screen capture from the per-session helper and
/// returns the raw PNG bytes. Screenshots need actual desktop pixels, which
/// only exist from a process running in the interactive session - see
/// processes/windows_apps.rs for the same Session-0 isolation constraint
/// applied to window enumeration.
pub fn capture_screenshot() -> Result<Vec<u8>, String> {
    let start = std::time::Instant::now();

    loop {
        match std::fs::OpenOptions::new().read(true).write(true).open(PIPE_NAME) {
            Ok(mut pipe) => {
                write_request(&mut pipe, &HelperRequest::Screenshot).map_err(|e| format!("Failed to send request to helper pipe: {e}"))?;
                return read_screenshot_response(&mut pipe);
            }
            Err(e) => {
                // ERROR_PIPE_BUSY (231): same transient-contention handling
                // as fetch_windowed_pids.
                if e.raw_os_error() == Some(231) && start.elapsed() < HELPER_TIMEOUT {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }

                return Err(format!("Could not connect to helper pipe (is the helper running for the logged-in user?): {e}"));
            }
        }
    }
}

fn read_screenshot_response(pipe: &mut std::fs::File) -> Result<Vec<u8>, String> {
    let mut len_bytes = [0u8; 4];
    pipe.read_exact(&mut len_bytes).map_err(|e| format!("Failed to read header length: {e}"))?;
    let header_len = u32::from_le_bytes(len_bytes) as usize;

    let mut header_bytes = vec![0u8; header_len];
    pipe.read_exact(&mut header_bytes).map_err(|e| format!("Failed to read header: {e}"))?;
    let header: ScreenshotHeader = serde_json::from_slice(&header_bytes).map_err(|e| format!("Malformed header: {e}"))?;

    if let Some(error) = header.error {
        return Err(format!("Helper reported a capture failure: {error}"));
    }

    let mut png_bytes = vec![0u8; header.png_byte_len as usize];
    pipe.read_exact(&mut png_bytes).map_err(|e| format!("Failed to read PNG bytes: {e}"))?;

    Ok(png_bytes)
}
