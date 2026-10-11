// Service-side pipe client for the shared annotation overlay. Forwards the
// shapes a remote viewer draws to the per-session helper, which paints them
// on its transparent, click-through, DISPLAY-ONLY overlay (see
// annotation_overlay.rs in the helper binary). Fire-and-forget: annotations
// are cosmetic, so a dropped update just means a slightly stale overlay,
// not a correctness problem - no response is read.

use std::io::Write;
use std::time::Duration;

use crate::helper_ipc::{run_with_timeout, HelperRequest, WireShape, PIPE_NAME};

/// Bounded like every other helper-pipe call so a wedged helper can never
/// hang the caller (see run_with_timeout's doc comment).
const ANNOTATE_TIMEOUT: Duration = Duration::from_secs(2);

/// Sends the current annotation shapes to the helper overlay.
pub fn send_shapes(shapes: Vec<WireShape>) {
    let _ = run_with_timeout(ANNOTATE_TIMEOUT, move || {
        write_request(&HelperRequest::Annotate { shapes });
    });
}

/// Clears the helper overlay.
pub fn clear() {
    let _ = run_with_timeout(ANNOTATE_TIMEOUT, || {
        write_request(&HelperRequest::AnnotateClear);
    });
}

fn write_request(request: &HelperRequest) {
    match std::fs::OpenOptions::new().read(true).write(true).open(PIPE_NAME) {
        Ok(mut pipe) => {
            if let Ok(mut line) = serde_json::to_vec(request) {
                line.push(b'\n');
                let _ = pipe.write_all(&line);
                let _ = pipe.flush();
            }
        }
        Err(e) => {
            tracing::debug!("Annotation overlay pipe unavailable (helper not running?): {e}");
        }
    }
}
