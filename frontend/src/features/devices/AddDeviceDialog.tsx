import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { deviceApi } from "@/api/device.api";
import type { PairingCode } from "@/api/device.api";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Button, Input } from "@/components/ui/kit";
import { API_BASE_URL } from "@/lib/apiConfig";
import { routes } from "@/lib/routes";
import { useSocket } from "@/realtime/useSocket";
import { useCreatePairingCode } from "./useDevices";

interface AddDeviceDialogProps {
  orgId: string;
  open: boolean;
  onClose: () => void;
}

/// The agent connects to the same backend this dashboard talks to.
function agentServerUrl(): string {
  return API_BASE_URL || window.location.origin;
}

/// Run from the agent folder in an Administrator PowerShell: builds the
/// agent, exchanges the code for the device's token, and installs it.
function installCommand(code: string): string {
  return `.\\scripts\\install-service.ps1 -PairingCode ${code} -ServerUrl ${agentServerUrl()}`;
}

/// Seconds until `expiresAt`, ticking once a second; 0 once it has passed.
function useSecondsLeft(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000)) : 0;
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/// Three steps: name the device; show its pairing code and the install
/// command, waiting for the laptop; then confirm it paired. No token is
/// ever shown - the agent gets its own when it presents the code.
export function AddDeviceDialog({ orgId, open, onClose }: AddDeviceDialogProps) {
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [pairedDeviceId, setPairedDeviceId] = useState<string | null>(null);
  const createCode = useCreatePairingCode(orgId);
  const { socket } = useSocket();
  const navigate = useNavigate();
  const secondsLeft = useSecondsLeft(pairedDeviceId ? null : (pairing?.expiresAt ?? null));
  const expired = pairing !== null && pairedDeviceId === null && secondsLeft === 0;

  // The backend announces each pairing to the organization's consoles; this
  // dialog moves on when it's the code it is showing.
  useEffect(() => {
    if (!socket || !pairing) return;
    const onAdded = (payload: { deviceId: string; pairingCodeId: string }) => {
      if (payload.pairingCodeId === pairing.id) setPairedDeviceId(payload.deviceId);
    };
    socket.on("device:added", onAdded);
    return () => {
      socket.off("device:added", onAdded);
    };
  }, [socket, pairing]);

  function reset(): void {
    setName("");
    setPairing(null);
    setPairedDeviceId(null);
    createCode.reset();
  }

  function handleClose(): void {
    // A code nobody used is cancelled rather than left valid for its
    // remaining minutes. Best effort: it expires on its own anyway.
    if (pairing && !pairedDeviceId && !expired) {
      deviceApi.cancelPairingCode(orgId, pairing.id).catch(() => undefined);
    }
    reset();
    onClose();
  }

  function requestCode(deviceName: string): void {
    createCode.mutate(deviceName, { onSuccess: setPairing });
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!name.trim()) return;
    requestCode(name.trim());
  }

  if (pairing && pairedDeviceId) {
    return (
      <Dialog open={open} onClose={handleClose} title={`${pairing.deviceName} is paired`} icon="check_circle">
        <div className="flex flex-col gap-md">
          <p className="text-body-sm text-on-surface-variant">
            The agent has its token. It will show as online once the installer finishes and the service connects.
          </p>
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={handleClose}>
              Close
            </Button>
            <Button
              variant="primary"
              icon="arrow_forward"
              onClick={() => {
                handleClose();
                navigate(routes.device(orgId, pairedDeviceId));
              }}
            >
              Open device
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  if (pairing) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title={`Pair ${pairing.deviceName}`}
        icon="key"
        className="max-w-lg"
        description="On the laptop, open PowerShell as Administrator in the Sentinel agent folder and run the command below."
      >
        <div className="flex flex-col gap-md">
          <div className="flex flex-col items-center gap-xs rounded-xl bg-surface-container-highest px-md py-md">
            <span className="font-mono text-label-mono uppercase text-on-surface-variant">Pairing code</span>
            <span
              className={`font-mono text-[32px] font-semibold tracking-[0.2em] ${expired ? "text-on-surface-variant line-through" : "text-on-surface"}`}
            >
              {pairing.code}
            </span>
            <span className={`font-mono text-[11px] uppercase tracking-wider ${expired ? "text-error" : "text-on-surface-variant"}`}>
              {expired ? "Expired" : `Expires in ${formatCountdown(secondsLeft)}`}
            </span>
          </div>

          <div className="flex flex-col gap-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-label-mono uppercase text-on-surface-variant">Install command</span>
              <CopyButton text={installCommand(pairing.code)} />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-container-highest px-3 py-2.5 font-mono text-[12px] leading-relaxed text-on-surface">
              {installCommand(pairing.code)}
            </pre>
          </div>

          {expired ? (
            <p className="flex items-start gap-xs text-body-sm text-error">
              <Icon name="error_outline" size={18} className="mt-px shrink-0" />
              This code has expired. Get a new one to continue.
            </p>
          ) : (
            <p className="flex items-center gap-xs text-body-sm text-on-surface-variant">
              <Icon name="sync" size={18} className="shrink-0 animate-spin" />
              Waiting for the laptop to pair…
            </p>
          )}
          {createCode.isError && <p className="text-body-sm text-error">{extractErrorMessage(createCode.error)}</p>}

          <div className="flex justify-end gap-sm">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            {expired && (
              <Button
                variant="primary"
                icon={createCode.isPending ? "sync" : "key"}
                disabled={createCode.isPending}
                onClick={() => requestCode(pairing.deviceName)}
              >
                New code
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissible={!createCode.isPending}
      title="Add a device"
      icon="add"
      description="Name the laptop. You'll get a short code to pair the Sentinel agent on it - no tokens to copy."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-sm" noValidate>
        <label htmlFor="device-name" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
          Device name
        </label>
        <Input
          id="device-name"
          icon="laptop_mac"
          value={name}
          maxLength={100}
          autoFocus
          placeholder="e.g. Design team laptop"
          onChange={(e) => setName(e.target.value)}
        />
        {createCode.isError && <p className="text-body-sm text-error">{extractErrorMessage(createCode.error)}</p>}
        <div className="mt-sm flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={createCode.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={createCode.isPending ? "sync" : "key"} disabled={!name.trim() || createCode.isPending}>
            {createCode.isPending ? "Creating…" : "Get pairing code"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
