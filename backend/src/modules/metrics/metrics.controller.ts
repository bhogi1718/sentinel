import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getDevice } from "../../common/requestContext";
import { metricsService } from "./metrics.service";

export const metricsController = {
  async get(req: Request, res: Response): Promise<void> {
    const metrics = await metricsService.getMetrics(getDevice(req));
    sendSuccess(res, metrics);
  },
};
