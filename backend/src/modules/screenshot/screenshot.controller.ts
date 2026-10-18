import { Request, Response } from "express";
import { getAuditSubject, getDevice } from "../../common/requestContext";
import { auditService } from "../audit/audit.service";
import { screenshotService } from "./screenshot.service";

export const screenshotController = {
  async capture(req: Request, res: Response): Promise<void> {
    const pngBytes = await auditService.track(getAuditSubject(req), "SCREENSHOT_CAPTURED", () =>
      screenshotService.capture(getDevice(req)),
    );
    res.setHeader("Content-Type", "image/png");
    res.send(pngBytes);
  },
};
