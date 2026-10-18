import { describe, expect, it } from "vitest";
import { crc32 } from "./png";
import {
  fileContents,
  initialMetrics,
  listFolder,
  nextMetrics,
  processList,
  renderScreen,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from "./simulatedData";

/// Deterministic pseudo-random numbers, so ranges are tested reproducibly.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("png encoding", () => {
  it("computes the standard CRC-32", () => {
    // The CRC every PNG's IEND chunk carries.
    expect(crc32(Buffer.from("IEND", "ascii"))).toBe(0xae426082);
  });

  it("renders the demo screen as a valid PNG at full and stream size", () => {
    const full = renderScreen(new Date(0));
    expect(full.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(pngSize(full)).toEqual({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
    expect(pngSize(renderScreen(new Date(0), 0.75))).toEqual({ width: 720, height: 405 });
  });

  it("changes from frame to frame, so a live view is visibly live", () => {
    expect(renderScreen(new Date(1_000)).equals(renderScreen(new Date(5_000)))).toBe(false);
  });
});

describe("simulated metrics", () => {
  it("stay within believable bounds over a long run", () => {
    const random = seeded(42);
    let metrics = initialMetrics();
    for (let i = 0; i < 5_000; i++) {
      metrics = nextMetrics(metrics, random);
      expect(metrics.cpuPercent).toBeGreaterThanOrEqual(3);
      expect(metrics.cpuPercent).toBeLessThanOrEqual(88);
      expect(metrics.memoryUsedBytes).toBeLessThanOrEqual(metrics.memoryTotalBytes);
      expect(metrics.batteryPercent).toBeGreaterThan(0);
      expect(metrics.batteryPercent).toBeLessThanOrEqual(100);
      expect(metrics.pingMs).toBeGreaterThan(0);
    }
  });

  it("only ever grow the network totals", () => {
    const random = seeded(7);
    const before = initialMetrics();
    const after = nextMetrics(before, random);
    expect(after.networkTotalReceivedBytes).toBeGreaterThan(before.networkTotalReceivedBytes);
    expect(after.networkTotalTransmittedBytes).toBeGreaterThan(before.networkTotalTransmittedBytes);
  });
});

describe("simulated processes and files", () => {
  it("leaves out processes the visitor ended", () => {
    const random = seeded(1);
    const all = processList(random, new Set());
    const chrome = all.find((process) => process.name === "chrome.exe")!;

    const remaining = processList(random, new Set([chrome.pid]));

    expect(remaining).toHaveLength(all.length - 1);
    expect(remaining.some((process) => process.pid === chrome.pid)).toBe(false);
  });

  it("lists folders, and refuses paths that don't exist", () => {
    expect(listFolder("")?.map((entry) => entry.name)).toContain("Documents");
    expect(listFolder("Documents/Projects")?.length).toBeGreaterThan(0);
    expect(listFolder("Windows/System32")).toBeNull();
  });

  it("serves placeholder contents for files only", () => {
    expect(fileContents("Documents/Projects/roadmap.md")?.toString()).toContain("Simulated file");
    expect(fileContents("Documents")).toBeNull();
    expect(fileContents("../secrets.txt")).toBeNull();
  });
});
