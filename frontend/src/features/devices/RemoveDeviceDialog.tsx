import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import type { Device } from "@/api/device.api";
import type { DeviceRef } from "@/api/paths";
import { Dialog } from "@/components/ui/Dialog";
import { Button, Input } from "@/components/ui/kit";
import { routes } from "@/lib/routes";
import { useRemoveDevice } from "./useDevices";

interface RemoveDeviceDialogProps {
  deviceRef: DeviceRef;
  device: Device;
  open: boolean;
  onClose: () => void;
}

/// Removing a device can't be undone - its history goes with it and its
/// agent token stops working - so the name has to be typed to confirm.
export function RemoveDeviceDialog({ deviceRef, device, open, onClose }: RemoveDeviceDialogProps) {
  const [typedName, setTypedName] = useState("");
  const removeDevice = useRemoveDevice(deviceRef);
  const navigate = useNavigate();
  const matches = typedName.trim() === device.name;

  function handleClose(): void {
    setTypedName("");
    removeDevice.reset();
    onClose();
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!matches) return;
    removeDevice.mutate(undefined, { onSuccess: () => navigate(routes.devices(deviceRef.orgId), { replace: true }) });
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissible={!removeDevice.isPending}
      title={`Remove ${device.name}?`}
      icon="delete"
      tone="danger"
      description="Its history is deleted and its agent is disconnected for good. This can't be undone."
    >
      <form onSubmit={handleSubmit} className="mt-sm flex flex-col gap-sm" noValidate>
        <label htmlFor="remove-device-name" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
          Type the device name to confirm
        </label>
        <Input
          id="remove-device-name"
          icon="laptop_mac"
          value={typedName}
          autoFocus
          autoComplete="off"
          placeholder={device.name}
          onChange={(e) => setTypedName(e.target.value)}
        />
        {removeDevice.isError && <p className="text-body-sm text-error">{extractErrorMessage(removeDevice.error)}</p>}
        <div className="mt-sm flex justify-end gap-sm">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={removeDevice.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" icon={removeDevice.isPending ? "sync" : "delete"} disabled={!matches || removeDevice.isPending}>
            {removeDevice.isPending ? "Removing…" : "Remove device"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
