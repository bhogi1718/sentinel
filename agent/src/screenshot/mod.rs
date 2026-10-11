use serde::Deserialize;
use std::io::Read;
use std::time::Duration;

use crate::helper_ipc::{run_with_timeout, write_request, HelperRequest, ScreenshotHeader, StreamFrameHeader, PIPE_NAME};

#[derive(Debug, Deserialize)]
pub struct ScreenshotRequest {
    #[serde(rename = "requestId")]
    pub request_id: String,
}

/// A single live-stream frame is bounded tighter than a one-shot
/// screenshot: if the helper can't produce a frame within a couple of
/// seconds the stream loop should just skip it and try the next tick rather
/// than stalling the cadence - a stale frame is worse than a dropped one.
const STREAM_FRAME_TIMEOUT: Duration = Duration::from_secs(4);

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
///
/// The whole attempt is bounded by `run_with_timeout`, not just the connect
/// retry loop - see its doc comment. Without that outer bound, a helper
/// that accepted the pipe connection but then wedged (or had its session go
/// non-interactive) mid-capture would leave `read_screenshot_response`
/// blocked on `read_exact` forever, which - since this runs inside
/// `spawn_blocking` under a socket.io event callback that's awaited inline
/// on the connection's single packet-processing task - would freeze the
/// whole agent, not just this one screenshot request.
pub fn capture_screenshot() -> Result<Vec<u8>, String> {
    match run_with_timeout(HELPER_TIMEOUT, connect_and_capture_screenshot) {
        Some(result) => result,
        None => Err(format!(
            "Timed out after {HELPER_TIMEOUT:?} waiting for the helper pipe - it accepted a \
             connection but never responded (helper may be wedged or its session may have gone \
             non-interactive mid-capture)"
        )),
    }
}

fn connect_and_capture_screenshot() -> Result<Vec<u8>, String> {
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

/// Requests a single downscaled-JPEG stream frame from the per-session
/// helper. Same helper-pipe mechanics and hang protection as
/// capture_screenshot, just a different request/response framing (JPEG, and
/// a tighter timeout - see STREAM_FRAME_TIMEOUT). The stream loop in
/// socket_client.rs calls this on each tick.
pub fn capture_stream_frame(max_width: u32, quality: u8) -> Result<Vec<u8>, String> {
    match run_with_timeout(STREAM_FRAME_TIMEOUT, move || connect_and_capture_stream_frame(max_width, quality)) {
        Some(result) => result,
        None => Err(format!(
            "Timed out after {STREAM_FRAME_TIMEOUT:?} waiting for a stream frame from the helper pipe"
        )),
    }
}

fn connect_and_capture_stream_frame(max_width: u32, quality: u8) -> Result<Vec<u8>, String> {
    let start = std::time::Instant::now();

    loop {
        match std::fs::OpenOptions::new().read(true).write(true).open(PIPE_NAME) {
            Ok(mut pipe) => {
                write_request(&mut pipe, &HelperRequest::StreamFrame { max_width, quality })
                    .map_err(|e| format!("Failed to send stream frame request to helper pipe: {e}"))?;
                return read_stream_frame_response(&mut pipe);
            }
            Err(e) => {
                if e.raw_os_error() == Some(231) && start.elapsed() < STREAM_FRAME_TIMEOUT {
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                }
                return Err(format!("Could not connect to helper pipe for stream frame: {e}"));
            }
        }
    }
}

fn read_stream_frame_response(pipe: &mut std::fs::File) -> Result<Vec<u8>, String> {
    let mut len_bytes = [0u8; 4];
    pipe.read_exact(&mut len_bytes).map_err(|e| format!("Failed to read header length: {e}"))?;
    let header_len = u32::from_le_bytes(len_bytes) as usize;

    let mut header_bytes = vec![0u8; header_len];
    pipe.read_exact(&mut header_bytes).map_err(|e| format!("Failed to read header: {e}"))?;
    let header: StreamFrameHeader = serde_json::from_slice(&header_bytes).map_err(|e| format!("Malformed header: {e}"))?;

    if let Some(error) = header.error {
        return Err(format!("Helper reported a capture failure: {error}"));
    }

    let mut jpeg_bytes = vec![0u8; header.jpeg_byte_len as usize];
    pipe.read_exact(&mut jpeg_bytes).map_err(|e| format!("Failed to read JPEG bytes: {e}"))?;

    Ok(jpeg_bytes)
}
