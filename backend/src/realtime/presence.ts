// Which devices have an agent connected to this server right now - the
// source of truth for "online". It is derived from live sockets rather than
// a database flag, so it can never be left stale by a restart or a crash:
// a server that just started has no sockets, so it reports every device
// offline until its agent connects, without writing anything that another
// still-running instance (e.g. during a rolling deploy) would also read.
//
// The devices table's isOnline column is still written on connect and
// disconnect as a last-known record, but nothing decides reachability from it.

// The socket that most recently connected as each device. Reconnects can
// arrive a few ms apart (e.g. the agent's force-reconnect-on-failed-emit
// path), so a disconnect from an older, already-superseded socket must not
// clear the newer one - see `disconnected`.
const currentSocketByDevice = new Map<string, string>();

export const presence = {
  connected(deviceId: string, socketId: string): void {
    currentSocketByDevice.set(deviceId, socketId);
  },

  /// Records a socket's disconnect. Returns false (and changes nothing) when
  /// a newer socket has already taken over for the device, so callers know
  /// the device is in fact still connected.
  disconnected(deviceId: string, socketId: string): boolean {
    if (currentSocketByDevice.get(deviceId) !== socketId) return false;
    currentSocketByDevice.delete(deviceId);
    return true;
  },

  currentSocketId(deviceId: string): string | undefined {
    return currentSocketByDevice.get(deviceId);
  },

  isConnected(deviceId: string): boolean {
    return currentSocketByDevice.has(deviceId);
  },
};
