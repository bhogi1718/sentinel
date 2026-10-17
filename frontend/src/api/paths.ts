/// Every organization and device id that goes into a URL passes through
/// these, so routes are built (and encoded) in exactly one place.

export interface DeviceRef {
  orgId: string;
  deviceId: string;
}

export function orgPath(orgId: string): string {
  return `/orgs/${encodeURIComponent(orgId)}`;
}

export function devicePath({ orgId, deviceId }: DeviceRef): string {
  return `${orgPath(orgId)}/devices/${encodeURIComponent(deviceId)}`;
}
