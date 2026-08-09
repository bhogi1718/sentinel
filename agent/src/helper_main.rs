// Lightweight per-session companion to sentinel-agent.exe. Runs as the
// logged-in interactive user (started via a Scheduled Task with an
// at-logon trigger, not the LocalSystem Windows Service), where it has
// natural, ACL-free access to the interactive desktop. Its only job is to
// answer "which processes currently own a visible top-level window" over
// a named pipe - see windows_apps.rs's doc comment for why this is a
// separate process at all rather than the main service just doing this
// itself.
mod helper_ipc;
mod processes {
    pub mod windows_apps;
}

use tokio::io::AsyncWriteExt;
use tokio::net::windows::named_pipe::ServerOptions;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    tracing::info!("Sentinel Agent Helper starting, listening on {}", helper_ipc::PIPE_NAME);

    let security_attributes = match helper_ipc::PipeSecurityAttributes::build() {
        Ok(attrs) => attrs,
        Err(e) => {
            tracing::error!("Failed to build pipe security descriptor: {e}. Exiting.");
            return;
        }
    };

    loop {
        // SAFETY: security_attributes.as_ptr() points at a SECURITY_ATTRIBUTES
        // that outlives this call (owned by the enclosing scope, dropped only
        // at process exit), satisfying create_with_security_attributes_raw's
        // safety contract.
        let server = match unsafe {
            ServerOptions::new().create_with_security_attributes_raw(helper_ipc::PIPE_NAME, security_attributes.as_ptr())
        } {
            Ok(server) => server,
            Err(e) => {
                tracing::error!("Failed to create named pipe server: {e}. Retrying in 5s...");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };

        if let Err(e) = server.connect().await {
            tracing::error!("Failed to accept pipe connection: {e}");
            continue;
        }

        let pids = processes::windows_apps::windowed_pids();
        let response = helper_ipc::WindowedPidsResponse {
            pids: pids.into_iter().collect(),
        };

        let payload = match serde_json::to_vec(&response) {
            Ok(bytes) => bytes,
            Err(e) => {
                tracing::error!("Failed to serialize response: {e}");
                continue;
            }
        };

        let mut server = server;
        if let Err(e) = server.write_all(&payload).await {
            tracing::error!("Failed to write response to pipe: {e}");
        }
        if let Err(e) = server.shutdown().await {
            tracing::warn!("Failed to shut down pipe after write: {e}");
        }

        // ServerOptions::create's handle is single-use per client - the
        // loop re-creates the pipe instance for the next connection, same
        // pattern the tokio named_pipe docs recommend for a "listen
        // forever" server.
        drop(server);
    }
}
