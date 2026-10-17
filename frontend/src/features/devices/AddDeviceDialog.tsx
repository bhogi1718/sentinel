import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import type { CreatedDevice } from "@/api/device.api";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Button, Input } from "@/components/ui/kit";
import { API_BASE_URL } from "@/lib/apiConfig";
import { routes } from "@/lib/routes";
import { useCreateDevice } from "./useDevices";

interface AddDeviceDialogProps {
  orgId: string;
  open: boolean;
  onClose: () => void;
}

/// The agent connects to the same backend this dashboard talks to.
function agentServerUrl(): string {
  return API_BASE_URL || window.location.origin;
}

function agentConfig(token: string): string {
  return [
    `server_url = "${agentServerUrl()}"`,
    `device_token = "${token}"`,
    `browse_root = 'C:\\Users\\<you>'`,
  ].join("\n");
}

/// Two steps: name the device, then show its agent token - once. The server
/// keeps only a hash, so closing this dialog is the last chance to copy it.
export function AddDeviceDialog({ orgId, open, onClose }: AddDeviceDialogProps) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedDevice | null>(null);
  const createDevice = useCreateDevice(orgId);
  const navigate = useNavigate();

  function handleClose(): void {
    setName("");
    setCreated(null);
    createDevice.reset();
    onClose();
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!name.trim()) return;
    createDevice.mutate(name.trim(), { onSuccess: setCreated });
  }

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        dismissible={false}
        title={`${created.device.name} is registered`}
        icon="key"
        className="max-w-lg"
        description="Put this in the agent's agent.toml on the laptop, then start the Sentinel service. The token is shown only once."
      >
        <div className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-label-mono uppercase text-on-surface-variant">Device token</span>
              <CopyButton text={created.token} />
            </div>
            <code className="block break-all rounded-lg bg-surface-container-highest px-3 py-2.5 font-mono text-[12px] text-on-surface">
              {created.token}
            </code>
          </div>

          <div className="flex flex-col gap-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono text-label-mono uppercase text-on-surface-variant">agent.toml</span>
              <CopyButton text={agentConfig(created.token)} />
            </div>
            <pre className="overflow-x-auto rounded-lg bg-surface-container-highest px-3 py-2.5 font-mono text-[12px] leading-relaxed text-on-surface">
              {agentConfig(created.token)}
            </pre>
          </div>

          <p className="flex items-start gap-xs text-body-sm text-warning">
            <Icon name="error_outline" size={18} className="mt-px shrink-0" />
            Anyone with this token can act as this device. If it's lost or leaked, rotate it from the server.
          </p>

          <div className="flex justify-end gap-sm">
            <Button
              variant="secondary"
              onClick={() => {
                const deviceId = created.device.id;
                handleClose();
                navigate(routes.device(orgId, deviceId));
              }}
            >
              Open device
            </Button>
            <Button variant="primary" icon="check" onClick={handleClose}>
              I've saved it
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissible={!createDevice.isPending}
      title="Add a device"
      icon="add"
      description="Register a laptop, then install the Sentinel agent on it with the token you'll get next."
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
        {createDevice.isError && <p className="text-body-sm text-error">{extractErrorMessage(createDevice.error)}</p>}
        <div className="mt-sm flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={createDevice.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={createDevice.isPending ? "sync" : "add"} disabled={!name.trim() || createDevice.isPending}>
            {createDevice.isPending ? "Adding…" : "Add device"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
