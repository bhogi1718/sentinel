use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use tracing::{error, info};
use windows_service::service::{
    ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::{define_windows_service, service_dispatcher};

pub const SERVICE_NAME: &str = "SentinelAgent";
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

define_windows_service!(ffi_service_main, service_main);

/// Entry point when the executable is launched by the Windows Service
/// Control Manager (as opposed to run directly as a console app). Blocks
/// until the SCM stops the service.
pub fn run_as_service() -> windows_service::Result<()> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)
}

fn service_main(_arguments: Vec<OsString>) {
    // Held for the lifetime of service_main - dropping it stops the
    // non-blocking writer from flushing, so it must outlive every log call
    // below, not just the subscriber initialization.
    let _log_guard = init_file_logging();

    if let Err(e) = run_service() {
        error!("Service failed: {e}");
    }
}

/// A Windows Service has no console, so stdout logging goes nowhere.
/// Writes to a rolling daily log file next to the executable instead.
fn init_file_logging() -> tracing_appender::non_blocking::WorkerGuard {
    let log_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let file_appender = tracing_appender::rolling::daily(log_dir, "sentinel-agent.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env().add_directive("info".parse().unwrap()))
        .init();

    guard
}

fn run_service() -> windows_service::Result<()> {
    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();

    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            ServiceControl::Stop | ServiceControl::Shutdown => {
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;

    status_handle.set_service_status(ServiceStatus {
        service_type: SERVICE_TYPE,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    info!("Sentinel Agent service started");

    let shutdown_token = CancellationToken::new();
    let runtime_shutdown = shutdown_token.clone();

    // The Rust async runtime and the SCM's synchronous control-handler
    // thread are two different worlds: control_event callbacks must return
    // immediately and cannot themselves be async, so the Stop/Shutdown
    // handler above just signals a std::sync::mpsc channel, and this
    // dedicated OS thread bridges that signal into the tokio
    // CancellationToken the async runtime actually understands.
    std::thread::spawn(move || {
        let _ = shutdown_rx.recv();
        runtime_shutdown.cancel();
    });

    let config_path = service_config_path();

    let runtime = tokio::runtime::Runtime::new().map_err(|e| {
        error!("Failed to create tokio runtime: {e}");
        windows_service::Error::LaunchArgumentsNotSupported
    })?;

    runtime.block_on(crate::agent_runtime::run(&config_path, shutdown_token));

    status_handle.set_service_status(ServiceStatus {
        service_type: SERVICE_TYPE,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    info!("Sentinel Agent service stopped");
    Ok(())
}

/// Services run with no defined working directory, so agent.toml must be
/// located relative to the executable's own path, not the process cwd.
fn service_config_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("agent.toml")))
        .unwrap_or_else(|| PathBuf::from("agent.toml"))
}
