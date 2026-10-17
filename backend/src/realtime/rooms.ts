// Socket.IO room names, built in one place so they are never spelled by
// hand - a typo in a room name silently delivers to nobody (or the wrong
// audience) rather than failing loudly.

/// Dashboard sockets of every member of an organization. All dashboard
/// broadcasts (events, device status, command updates, live-view state) go
/// to the room of the organization they belong to, and nowhere else.
export function orgRoom(orgId: string): string {
  return `org:${orgId}`;
}

/// A device's agent socket, in the /agent namespace.
export function deviceRoom(deviceId: string): string {
  return `device:${deviceId}`;
}

/// Dashboard sockets currently watching one device's live view.
export function streamRoom(deviceId: string): string {
  return `stream:${deviceId}`;
}
