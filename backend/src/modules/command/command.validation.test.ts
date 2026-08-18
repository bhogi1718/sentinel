import { describe, expect, it } from "vitest";
import { createCommandSchema } from "./command.validation";

describe("createCommandSchema", () => {
  it("accepts a simple command type with no payload", () => {
    const result = createCommandSchema.safeParse({ body: { type: "LOCK" } });
    expect(result.success).toBe(true);
  });

  it("accepts KILL_PROCESS with a valid pid and name", () => {
    const result = createCommandSchema.safeParse({ body: { type: "KILL_PROCESS", pid: 4821, name: "chrome.exe" } });
    expect(result.success).toBe(true);
  });

  it("rejects KILL_PROCESS without a pid", () => {
    const result = createCommandSchema.safeParse({ body: { type: "KILL_PROCESS", name: "chrome.exe" } });
    expect(result.success).toBe(false);
  });

  it("rejects KILL_PROCESS without a name", () => {
    const result = createCommandSchema.safeParse({ body: { type: "KILL_PROCESS", pid: 4821 } });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive pid", () => {
    const result = createCommandSchema.safeParse({ body: { type: "KILL_PROCESS", pid: -1, name: "chrome.exe" } });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer pid", () => {
    const result = createCommandSchema.safeParse({ body: { type: "KILL_PROCESS", pid: 4821.5, name: "chrome.exe" } });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = createCommandSchema.safeParse({ body: { type: "KILL_PROCESS", pid: 4821, name: "" } });
    expect(result.success).toBe(false);
  });

  it("strips an unrelated pid/name payload sent alongside a simple command type", () => {
    // Zod's default behavior is to strip unknown keys rather than reject
    // them - LOCK's branch of the union only defines `type`, so pid/name
    // (which belong to KILL_PROCESS's branch) are dropped, not rejected.
    const result = createCommandSchema.safeParse({ body: { type: "LOCK", pid: 4821, name: "chrome.exe" } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.type).toBe("LOCK");
      expect("pid" in result.data.body).toBe(false);
    }
  });

  it("rejects an unknown command type", () => {
    const result = createCommandSchema.safeParse({ body: { type: "REBOOT_TWICE" } });
    expect(result.success).toBe(false);
  });
});
