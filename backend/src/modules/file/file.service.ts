import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { deviceRepository } from "../device/device.repository";
import { findAgentSocket } from "../../realtime/socket";
import { FileEntry } from "./file.types";

const FILE_LIST_TIMEOUT_MS = 15_000;
const DOWNLOAD_START_TIMEOUT_MS = 15_000;
// Applies per chunk, not to the download as a whole - a large file legitimately
// takes a while, but any individual chunk going quiet this long means the
// agent has stalled or died mid-stream.
const DOWNLOAD_CHUNK_TIMEOUT_MS = 20_000;

interface PendingListRequest {
  resolve: (entries: FileEntry[]) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PendingDownload {
  onChunk: (chunk: Buffer) => void;
  onComplete: () => void;
  onError: (message: string) => void;
  timeout: NodeJS.Timeout;
  armTimeout: () => void;
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

async function getOnlineAgentSocket() {
  const device = await deviceRepository.findFirst();
  if (!device) {
    throw ApiError.notFound("No device has been registered yet");
  }
  if (!device.isOnline) {
    throw ApiError.conflict("Device is offline");
  }

  const agentSocket = await findAgentSocket(device.id);
  if (!agentSocket) {
    throw ApiError.conflict("Device is not currently connected");
  }

  return agentSocket;
}

export const fileService = {
  async listFiles(path: string): Promise<FileEntry[]> {
    const agentSocket = await getOnlineAgentSocket();
    const requestId = randomUUID();

    return new Promise<FileEntry[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingListRequests.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, FILE_LIST_TIMEOUT_MS);

      pendingListRequests.set(requestId, { resolve, reject, timeout });
      agentSocket.emit("files:list:request", { requestId, path });
    });
  },

  resolveListResponse(requestId: string, entries: FileEntry[]): void {
    const pending = pendingListRequests.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingListRequests.delete(requestId);
    pending.resolve(entries);
  },

  rejectListResponse(requestId: string, message: string): void {
    const pending = pendingListRequests.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingListRequests.delete(requestId);
    pending.reject(ApiError.badRequest(message));
  },

  /// Starts a download: emits the request to the agent and returns handlers
  /// the caller (the download route) wires up to pipe chunks into an HTTP
  /// response as they arrive. Rejects only if the agent can't be reached at
  /// all - once streaming begins, failures are reported via onError instead
  /// so the route can end the response cleanly rather than throwing mid-stream.
  async startDownload(
    path: string,
    handlers: { onChunk: (chunk: Buffer) => void; onComplete: () => void; onError: (message: string) => void },
  ): Promise<void> {
    const agentSocket = await getOnlineAgentSocket();
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

    pendingDownloads.set(requestId, { ...handlers, timeout: initialTimeout, armTimeout });
    agentSocket.emit("files:download:request", { requestId, path });
  },

  handleDownloadChunk(requestId: string, chunk: Buffer): void {
    const pending = pendingDownloads.get(requestId);
    if (!pending) return;
    pending.onChunk(chunk);
    pending.armTimeout();
  },

  handleDownloadComplete(requestId: string): void {
    const pending = pendingDownloads.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingDownloads.delete(requestId);
    pending.onComplete();
  },

  handleDownloadError(requestId: string, message: string): void {
    const pending = pendingDownloads.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingDownloads.delete(requestId);
    pending.onError(message);
  },
};
