import { EventType } from "@prisma/client";
import { FileEntry } from "../modules/file/file.types";
import { SystemMetrics } from "../modules/metrics/metrics.types";
import { ProcessInfo } from "../modules/process/process.types";
import { encodePng, Rgb } from "./png";

// Everything the demo device reports. Plausible, smoothly changing, and
// entirely made up - see docs/architecture/demo-mode.md.

export type Random = () => number;

const GB = 1024 ** 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---- Metrics -------------------------------------------------------------

export function initialMetrics(): SystemMetrics {
  return {
    cpuPercent: 18,
    memoryUsedBytes: 6.4 * GB,
    memoryTotalBytes: 16 * GB,
    diskUsedBytes: 312 * GB,
    diskTotalBytes: 512 * GB,
    batteryPercent: 82,
    networkDownloadBytesPerSec: 220_000,
    networkUploadBytesPerSec: 40_000,
    networkTotalReceivedBytes: 4.2 * GB,
    networkTotalTransmittedBytes: 0.9 * GB,
    pingMs: 24,
  };
}

/// One step of a bounded random walk, `seconds` after the previous reading.
export function nextMetrics(previous: SystemMetrics, random: Random, seconds = 2): SystemMetrics {
  const down = clamp(previous.networkDownloadBytesPerSec * (0.6 + random() * 0.8), 20_000, 3_000_000);
  const up = clamp(previous.networkUploadBytesPerSec * (0.6 + random() * 0.8), 5_000, 600_000);
  const battery = previous.batteryPercent ?? 80;

  return {
    ...previous,
    cpuPercent: clamp(previous.cpuPercent + (random() - 0.5) * 14, 3, 88),
    memoryUsedBytes: clamp(previous.memoryUsedBytes + (random() - 0.5) * 0.3 * GB, 4 * GB, 12.5 * GB),
    // Slowly drains, then "plugs in" and starts over.
    batteryPercent: battery <= 18 ? 96 : Math.round((battery - 0.05 * seconds) * 100) / 100,
    networkDownloadBytesPerSec: Math.round(down),
    networkUploadBytesPerSec: Math.round(up),
    networkTotalReceivedBytes: previous.networkTotalReceivedBytes + down * seconds,
    networkTotalTransmittedBytes: previous.networkTotalTransmittedBytes + up * seconds,
    pingMs: Math.round(clamp((previous.pingMs ?? 24) + (random() - 0.5) * 10, 12, 80)),
  };
}

// ---- Processes -----------------------------------------------------------

const PROCESSES: { pid: number; name: string; cpu: number; memoryMb: number; isApp: boolean }[] = [
  { pid: 4, name: "System", cpu: 0.4, memoryMb: 2, isApp: false },
  { pid: 132, name: "Registry", cpu: 0, memoryMb: 48, isApp: false },
  { pid: 1088, name: "svchost.exe", cpu: 0.2, memoryMb: 26, isApp: false },
  { pid: 1172, name: "svchost.exe", cpu: 0.1, memoryMb: 18, isApp: false },
  { pid: 2344, name: "MsMpEng.exe", cpu: 1.2, memoryMb: 210, isApp: false },
  { pid: 3120, name: "explorer.exe", cpu: 0.6, memoryMb: 140, isApp: true },
  { pid: 4410, name: "chrome.exe", cpu: 6.5, memoryMb: 1250, isApp: true },
  { pid: 4588, name: "Code.exe", cpu: 3.1, memoryMb: 690, isApp: true },
  { pid: 5021, name: "Teams.exe", cpu: 2.4, memoryMb: 520, isApp: true },
  { pid: 5530, name: "Spotify.exe", cpu: 1.1, memoryMb: 310, isApp: true },
  { pid: 6102, name: "OneDrive.exe", cpu: 0.3, memoryMb: 95, isApp: false },
  { pid: 6640, name: "slack.exe", cpu: 0.9, memoryMb: 380, isApp: true },
];

/// The process list, minus any the visitor has "ended".
export function processList(random: Random, ended: ReadonlySet<number>): ProcessInfo[] {
  return PROCESSES.filter((process) => !ended.has(process.pid)).map((process) => ({
    pid: process.pid,
    name: process.name,
    cpuPercent: Math.round(clamp(process.cpu * (0.5 + random()), 0, 100) * 10) / 10,
    memoryBytes: Math.round(process.memoryMb * (0.9 + random() * 0.2) * 1024 * 1024),
    isApp: process.isApp,
  }));
}

// ---- Files ---------------------------------------------------------------

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function folder(name: string, days: number): FileEntry {
  return { name, isDirectory: true, sizeBytes: 0, modifiedAt: daysAgo(days) };
}

function file(name: string, sizeBytes: number, days: number): FileEntry {
  return { name, isDirectory: false, sizeBytes, modifiedAt: daysAgo(days) };
}

const FILE_TREE: Record<string, FileEntry[]> = {
  "": [folder("Documents", 1), folder("Downloads", 3), folder("Pictures", 12), file("notes.txt", 2_310, 0)],
  Documents: [
    folder("Projects", 2),
    file("Q3 report.docx", 482_100, 6),
    file("Budget 2026.xlsx", 96_400, 9),
    file("Meeting notes.txt", 4_800, 1),
  ],
  "Documents/Projects": [file("roadmap.md", 7_900, 2), file("design-notes.txt", 3_200, 4)],
  Downloads: [file("product-brochure.pdf", 2_840_000, 3), file("invoice-1042.pdf", 118_000, 15)],
  Pictures: [file("team-offsite.jpg", 3_420_000, 12), file("whiteboard.png", 1_180_000, 20)],
};

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/// The entries of a folder, or null when it isn't one.
export function listFolder(path: string): FileEntry[] | null {
  return FILE_TREE[normalize(path)] ?? null;
}

/// The (generated) contents of a file, or null when it doesn't exist.
export function fileContents(path: string): Buffer | null {
  const normalized = normalize(path);
  const slash = normalized.lastIndexOf("/");
  const parent = slash === -1 ? "" : normalized.slice(0, slash);
  const name = slash === -1 ? normalized : normalized.slice(slash + 1);
  const entry = FILE_TREE[parent]?.find((candidate) => candidate.name === name && !candidate.isDirectory);
  if (!entry) return null;
  return Buffer.from(
    `Simulated file: ${normalized}\n\nThis file comes from the Sentinel demo device. ` +
      `Nothing on the demo device is real, so this placeholder stands in for the original ` +
      `${entry.sizeBytes.toLocaleString("en-US")} bytes.\n`,
  );
}

// ---- Events --------------------------------------------------------------

/// Background activity, so the timeline keeps moving. Each entry is an event
/// and, optionally, the event that naturally follows it a while later.
const BACKGROUND_ACTIVITY: { type: EventType; followUp?: EventType; metadata?: Record<string, unknown> }[] = [
  { type: "LOCK", followUp: "UNLOCK" },
  { type: "LOCK", followUp: "UNLOCK" },
  { type: "INTERNET_DISCONNECTED", followUp: "INTERNET_CONNECTED" },
  { type: "SLEEP", followUp: "WAKE" },
  { type: "BATTERY_LOW", metadata: { batteryPercent: 15 } },
];

export function pickBackgroundActivity(random: Random) {
  return BACKGROUND_ACTIVITY[Math.floor(random() * BACKGROUND_ACTIVITY.length)];
}

// ---- Screen --------------------------------------------------------------

export const SCREEN_WIDTH = 960;
export const SCREEN_HEIGHT = 540;

// 5x7 bitmap glyphs for the watermark.
const GLYPHS: Record<string, string[]> = {
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
};
const WATERMARK = "DEMO";
const GLYPH_SCALE = 5;
const WATERMARK_WIDTH = (WATERMARK.length * 6 - 1) * GLYPH_SCALE;
const WATERMARK_X = SCREEN_WIDTH - WATERMARK_WIDTH - 24;
const WATERMARK_Y = 20;

function watermarkPixel(x: number, y: number): boolean {
  const gx = Math.floor((x - WATERMARK_X) / GLYPH_SCALE);
  const gy = Math.floor((y - WATERMARK_Y) / GLYPH_SCALE);
  if (gx < 0 || gy < 0 || gy > 6 || gx >= WATERMARK.length * 6 - 1) return false;
  const letter = Math.floor(gx / 6);
  const column = gx % 6;
  if (column === 5) return false;
  return GLYPHS[WATERMARK[letter]][gy][column] === "1";
}

const TASKBAR_HEIGHT = 36;
const WINDOW = { left: 140, top: 90, right: 700, bottom: 410, titleBar: 30 };

/// The simulated desktop: a wallpaper, an app window with a progress bar
/// that moves with `time`, a taskbar, and a "DEMO" watermark - so a live
/// view is visibly live, and never mistakable for a real screen.
export function renderScreen(time: Date = new Date(), scale = 1): Buffer {
  const width = Math.round(SCREEN_WIDTH * scale);
  const height = Math.round(SCREEN_HEIGHT * scale);
  const progress = (time.getTime() % 8_000) / 8_000;
  const barLeft = WINDOW.left + 40;
  const barRight = WINDOW.right - 40;
  const barFill = barLeft + (barRight - barLeft) * progress;

  return encodePng(width, height, (px, py) => {
    const x = px / scale;
    const y = py / scale;

    if (watermarkPixel(x, y)) return [255, 255, 255];

    if (y >= SCREEN_HEIGHT - TASKBAR_HEIGHT) {
      const inStartButton = x >= 12 && x < 40 && y >= SCREEN_HEIGHT - 28 && y < SCREEN_HEIGHT - 8;
      return inStartButton ? [94, 234, 212] : [18, 22, 30];
    }

    const inWindow = x >= WINDOW.left && x < WINDOW.right && y >= WINDOW.top && y < WINDOW.bottom;
    if (inWindow) {
      if (y < WINDOW.top + WINDOW.titleBar) return [40, 46, 58];
      const inBar = x >= barLeft && x < barRight && y >= WINDOW.top + 150 && y < WINDOW.top + 166;
      if (inBar) return x < barFill ? [45, 212, 191] : [210, 214, 220];
      const inLine = (y - WINDOW.top - 60) % 22 < 8 && y < WINDOW.top + 130 && x < WINDOW.right - 120 - ((y * 7) % 90);
      return inLine && x > WINDOW.left + 40 ? [180, 186, 196] : [236, 239, 243];
    }

    // Wallpaper: a diagonal gradient from deep navy to teal.
    const t = (x / SCREEN_WIDTH + y / SCREEN_HEIGHT) / 2;
    const rgb: Rgb = [Math.round(12 + 20 * t), Math.round(24 + 90 * t), Math.round(48 + 80 * t)];
    return rgb;
  });
}
