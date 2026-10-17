import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { connectedAgentFor } from "../device/agentConnection";
import { OrgDevice } from "../device/device.types";
import { DeviceBoundRequest, pendingFor, settlePending } from "../../realtime/pendingRequests";
import { FileEntry } from "./file.types";

const FILE_LIST_TIMEOUT_MS = 15_000;
const DOWNLOAD_START_TIMEOUT_MS = 15_000;
// Each agent serves downloads over its one Socket.IO connection - too many
// concurrent transfers just contend with each other and with every other
// request to that agent (metrics, processes, commands) for the same pipe, so
// concurrency is capped per device, independent of the per-window rate limit
// on the route. The overall cap bounds how many open download responses this
// server holds across all devices, so one busy organization can't use up
// capacity that would otherwise go to everyone else.
const MAX_CONCURRENT_DOWNLOADS_PER_DEVICE = 5;
const MAX_CONCURRENT_DOWNLOADS = 20;
// Applies per chunk, not to the download as a whole - a large file legitimately
// takes a while, but any individual chunk going quiet this long means the
// agent has stalled or died mid-stream.
const DOWNLOAD_CHUNK_TIMEOUT_MS = 20_000;

interface PendingListRequest extends DeviceBoundRequest {
  resolve: (entries: FileEntry[]) => void;
  reject: (error: Error) => void;
}

interface PendingDownload extends DeviceBoundRequest {
  onChunk: (chunk: Buffer) => void;
  onComplete: () => void;
  onError: (message: string) => void;
  armTimeout: () => void;
}

function downloadsInProgressFor(deviceId: string): number {
  let count = 0;
  for (const download of pendingDownloads.values()) {
    if (download.deviceId === deviceId) count++;
  }
  return count;
}

// Same plain-event-plus-reply pattern used by commands and processes (see
// process.service.ts) - the agent's Socket.IO client library can't respond
// to a server-initiated ack, so requests are tracked here by ID instead.
const pendingListRequests = new Map<string, PendingListRequest>();

// Downloads are a stream of events (chunk*, then complete-or-error) rather
// than a single reply, so they're tracked separately from list requests -
// resolving a list request is a one-shot promise, but a download needs to
// keep feeding an open HTTP response as chunks arrive over time.
const pendingDownloads = new Map<string, PendingDownload>();

export const fileService = {
  async listFiles(device: OrgDevice, path: string): Promise<FileEntry[]> {
    const agentSocket = await connectedAgentFor(device, "list files");
    const requestId = randomUUID();

    return new Promise<FileEntry[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingListRequests.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, FILE_LIST_TIMEOUT_MS);

      pendingListRequests.set(requestId, { deviceId: device.id, resolve, reject, timeout });
      agentSocket.emit("files:list:request", { requestId, path });
    });
  },

  resolveListResponse(fromDeviceId: string, requestId: string, entries: FileEntry[]): void {
    settlePending(pendingListRequests, requestId, fromDeviceId)?.resolve(entries);
  },

  rejectListResponse(fromDeviceId: string, requestId: string, message: string): void {
    settlePending(pendingListRequests, requestId, fromDeviceId)?.reject(ApiError.badRequest(message));
  },

  /// Starts a download: emits the request to the agent and returns handlers
  /// the caller (the download route) wires up to pipe chunks into an HTTP
  /// response as they arrive. Rejects only if the agent can't be reached at
  /// all - once streaming begins, failures are reported via onError instead
  /// so the route can end the response cleanly rather than throwing mid-stream.
  async startDownload(
    device: OrgDevice,
    path: string,
    handlers: { onChunk: (chunk: Buffer) => void; onComplete: () => void; onError: (message: string) => void },
  ): Promise<void> {
    if (
      downloadsInProgressFor(device.id) >= MAX_CONCURRENT_DOWNLOADS_PER_DEVICE ||
      pendingDownloads.size >= MAX_CONCURRENT_DOWNLOADS
    ) {
      throw ApiError.tooManyRequests("Too many downloads in progress, try again shortly");
    }

    const requestId = randomUUID();

    const armTimeout = () => {
      const existing = pendingDownloads.get(requestId);
      if (existing) clearTimeout(existing.timeout);

      const timeout = setTimeout(() => {
        pendingDownloads.delete(requestId);
        handlers.onError("Download timed out - no data received from agent");
      }, DOWNLOAD_CHUNK_TIMEOUT_MS);

      const current = pendingDownloads.get(requestId);
      if (current) current.timeout = timeout;
    };

    const initialTimeout = setTimeout(() => {
      pendingDownloads.delete(requestId);
      handlers.onError("Agent did not start the download in time");
    }, DOWNLOAD_START_TIMEOUT_MS);

    // The slot is claimed synchronously, right after the cap check and
    // before any await - otherwise concurrent requests would all pass the
    // check while the agent lookup is in flight, and overshoot the caps.
    pendingDownloads.set(requestId, { deviceId: device.id, ...handlers, timeout: initialTimeout, armTimeout });

    let agentSocket: Awaited<ReturnType<typeof connectedAgentFor>>;
    try {
      agentSocket = await connectedAgentFor(device, "download files");
    } catch (err) {
      clearTimeout(initialTimeout);
      pendingDownloads.delete(requestId);
      throw err;
    }

    agentSocket.emit("files:download:request", { requestId, path });
  },

  handleDownloadChunk(fromDeviceId: string, requestId: string, chunk: Buffer): void {
    const pending = pendingFor(pendingDownloads, requestId, fromDeviceId);
    if (!pending) return;
    pending.onChunk(chunk);
    pending.armTimeout();
  },

  handleDownloadComplete(fromDeviceId: string, requestId: string): void {
    settlePending(pendingDownloads, requestId, fromDeviceId)?.onComplete();
  },

  handleDownloadError(fromDeviceId: string, requestId: string, message: string): void {
    settlePending(pendingDownloads, requestId, fromDeviceId)?.onError(message);
  },
};
