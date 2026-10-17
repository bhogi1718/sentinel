import { afterEach, describe, expect, it } from "vitest";
import { presence } from "./presence";

afterEach(() => {
  presence.disconnected("device-1", "socket-new");
  presence.disconnected("device-1", "socket-old");
});

describe("presence", () => {
  it("reports a device online only while its agent socket is connected", () => {
    expect(presence.isConnected("device-1")).toBe(false);

    presence.connected("device-1", "socket-old");
    expect(presence.isConnected("device-1")).toBe(true);

    expect(presence.disconnected("device-1", "socket-old")).toBe(true);
    expect(presence.isConnected("device-1")).toBe(false);
  });

  it("ignores the disconnect of a socket that a reconnect already replaced", () => {
    presence.connected("device-1", "socket-old");
    presence.connected("device-1", "socket-new");

    expect(presence.disconnected("device-1", "socket-old")).toBe(false);
    expect(presence.isConnected("device-1")).toBe(true);
    expect(presence.currentSocketId("device-1")).toBe("socket-new");
  });
});
