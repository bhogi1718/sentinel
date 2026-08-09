import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { telegramService } from "../telegram/telegram.service";

export const settingsController = {
  // No await needed - isConfigured() is synchronous - but asyncHandler
  // requires every handler to return a Promise so it can .catch() it.
  // eslint-disable-next-line @typescript-eslint/require-await
  async getIntegrationStatus(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, {
      telegram: { connected: telegramService.isConfigured() },
    });
  },
};
