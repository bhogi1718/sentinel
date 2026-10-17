import { createContext, useContext } from "react";
import type { Device } from "@/api/device.api";
import type { DeviceRef } from "@/api/paths";

export interface DeviceContextValue {
  /// The organization and device in the URL, for API calls.
  ref: DeviceRef;
  device: Device;
}

export const DeviceContext = createContext<DeviceContextValue | undefined>(undefined);

/// The device the current page belongs to. Only usable under DeviceLayout.
export function useCurrentDevice(): DeviceContextValue {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useCurrentDevice must be used inside a device route (DeviceLayout)");
  }
  return context;
}
