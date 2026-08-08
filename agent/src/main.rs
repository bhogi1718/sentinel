mod agent_runtime;
mod commands;
mod config;
mod events;
mod files;
mod helper_ipc;
mod metrics;
mod processes;
mod service;
mod socket_client;

use std::path::PathBuf;
use tokio_util::sync::CancellationToken;
use tracing::info;

fn console_config_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("agent.toml")))
        .unwrap_or_else(|| PathBuf::from("agent.toml"))
}

fn init_console_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();
}

/// Runs interactively: connects, spawns every watcher, and blocks until
/// Ctrl+C. This is the mode used during development (`cargo run`) and for
/// manually running the agent outside of the Windows Service framework.
fn run_console_mode() {
    init_console_logging();

    let runtime = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
    runtime.block_on(async {
        let shutdown = CancellationToken::new();
        let shutdown_for_signal = shutdown.clone();

        tokio::spawn(async move {
            let _ = tokio::signal::ctrl_c().await;
            info!("Ctrl+C received, shutting down...");
            shutdown_for_signal.cancel();
        });

        agent_runtime::run(&console_config_path(), shutdown).await;
    });
}

fn main() {
    // Launching via the Service Control Manager and launching normally
    // (double-click, `cargo run`, a terminal) look identical from the
    // process's own perspective except for this: service_dispatcher::start
    // only succeeds when a real SCM is on the other end of the pipe it
    // tries to connect to. When run outside a service context that
    // connection attempt fails immediately, which is exactly the signal
    // used here to fall back to console mode - there's no separate flag
    // required to pick the mode.
    if service::run_as_service().is_err() {
        run_console_mode();
    }
}
