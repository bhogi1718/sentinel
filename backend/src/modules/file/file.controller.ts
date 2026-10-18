import { Request, Response } from "express";
import path from "path";
import { ApiError } from "../../common/ApiError";
import { logger } from "../../config/logger";
import { sendSuccess } from "../../common/ApiResponse";
import { getAuditSubject, getDevice } from "../../common/requestContext";
import { auditService, failureReason } from "../audit/audit.service";
import { DownloadFileQuery, ListFilesQuery } from "./file.validation";
import { fileService } from "./file.service";

export const fileController = {
  async list(req: Request, res: Response): Promise<void> {
    const { path: dirPath } = req.query as unknown as ListFilesQuery;
    const entries = await auditService.track(
      getAuditSubject(req),
      "FILES_LISTED",
      () => fileService.listFiles(getDevice(req), dirPath),
      { path: dirPath },
    );
    sendSuccess(res, entries);
  },

  /// Streams the file straight through as it arrives from the agent rather
  /// than buffering it - see file.service.ts's startDownload doc comment.
  /// Errors that happen after streaming has already begun can't be reported
  /// as a normal JSON error response (headers are already sent), so the
  /// connection is simply destroyed and the browser sees a failed download.
  ///
  /// Every attempt is audited once it ends: SUCCESS with the bytes sent, or
  /// FAILURE with why.
  async download(req: Request, res: Response): Promise<void> {
    const { path: filePath } = req.query as unknown as DownloadFileQuery;
    const device = getDevice(req);
    const fileName = path.basename(filePath) || "download";
    const subject = getAuditSubject(req);

    let headersSent = false;
    let sizeBytes = 0;
    const audit = (outcome: "SUCCESS" | "FAILURE", extra: Record<string, unknown> = {}) =>
      auditService.record({ ...subject, action: "FILE_DOWNLOADED", outcome, detail: { path: filePath, ...extra } });

    await new Promise<void>((resolve) => {
      fileService
        .startDownload(device, filePath, {
          onChunk: (chunk) => {
            if (!headersSent) {
              headersSent = true;
              res.setHeader("Content-Type", "application/octet-stream");
              res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
            }
            sizeBytes += chunk.length;
            res.write(chunk);
          },
          onComplete: () => {
            res.end();
            void audit("SUCCESS", { sizeBytes }).finally(resolve);
          },
          onError: (message) => {
            logger.error(`Download failed for ${filePath}`, { message });
            if (headersSent) {
              res.destroy();
            } else {
              res.status(502).json({ success: false, error: { code: "DOWNLOAD_FAILED", message } });
            }
            void audit("FAILURE", { error: message }).finally(resolve);
          },
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError) {
            res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
          } else {
            const message = err instanceof Error ? err.message : "Failed to start download";
            res.status(502).json({ success: false, error: { code: "DOWNLOAD_FAILED", message } });
          }
          void audit("FAILURE", { error: failureReason(err) }).finally(resolve);
        });
    });
  },
};
