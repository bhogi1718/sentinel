import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { metricsService } from "./metrics.service";

export const metricsController = {
  async get(_req: Request, res: Response): Promise<void> {
    const metrics = await metricsService.getMetrics();
    sendSuccess(res, metrics);
  },
};
