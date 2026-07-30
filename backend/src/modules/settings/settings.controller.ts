import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { telegramService } from "../telegram/telegram.service";

export const settingsController = {
  async getIntegrationStatus(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, {
      telegram: { connected: telegramService.isConfigured() },
    });
  },
};
