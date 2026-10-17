import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceBoundRequest, pendingFor, settlePending } from "./pendingRequests";

interface TestRequest extends DeviceBoundRequest {
  label: string;
}

function pendingMap(): Map<string, TestRequest> {
  return new Map([["req-1", { deviceId: "device-a", timeout: setTimeout(() => undefined, 60_000), label: "for A" }]]);
}

const maps: Map<string, TestRequest>[] = [];
function tracked() {
  const map = pendingMap();
  maps.push(map);
  return map;
}

afterEach(() => {
  for (const map of maps.splice(0)) for (const request of map.values()) clearTimeout(request.timeout);
});

describe("pendingFor", () => {
  it("returns the request to the device it was sent to, and leaves it pending", () => {
    const pending = tracked();
    expect(pendingFor(pending, "req-1", "device-a")?.label).toBe("for A");
    expect(pending.has("req-1")).toBe(true);
  });

  it("ignores a reply from any other device", () => {
    const pending = tracked();
    expect(pendingFor(pending, "req-1", "device-b")).toBeUndefined();
    expect(pending.has("req-1")).toBe(true);
  });

  it("returns nothing for an unknown request", () => {
    expect(pendingFor(tracked(), "nope", "device-a")).toBeUndefined();
  });
});

describe("settlePending", () => {
  it("removes the request and cancels its timeout when the right device replies", () => {
    const pending = tracked();
    const clear = vi.spyOn(globalThis, "clearTimeout");

    const request = settlePending(pending, "req-1", "device-a");

    expect(request?.label).toBe("for A");
    expect(pending.has("req-1")).toBe(false);
    expect(clear).toHaveBeenCalledWith(request?.timeout);
    clear.mockRestore();
  });

  it("leaves the request pending for its real device when another device replies", () => {
    const pending = tracked();

    expect(settlePending(pending, "req-1", "device-b")).toBeUndefined();
    expect(settlePending(pending, "req-1", "device-a")?.label).toBe("for A");
  });
});
