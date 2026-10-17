import { Request, Response } from "express";
import { getDevice } from "../../common/requestContext";
import { screenshotService } from "./screenshot.service";

export const screenshotController = {
  async capture(req: Request, res: Response): Promise<void> {
    const pngBytes = await screenshotService.capture(getDevice(req));
    res.setHeader("Content-Type", "image/png");
    res.send(pngBytes);
  },
};
