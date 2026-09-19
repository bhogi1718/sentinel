import { Request, Response } from "express";
import { screenshotService } from "./screenshot.service";

export const screenshotController = {
  async capture(_req: Request, res: Response): Promise<void> {
    const pngBytes = await screenshotService.capture();
    res.setHeader("Content-Type", "image/png");
    res.send(pngBytes);
  },
};
