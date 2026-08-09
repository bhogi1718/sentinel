import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { settingsService } from "./settings.service";
import { ConnectTelegramInput } from "./settings.validation";

export const settingsController = {
  async getIntegrationStatus(_req: Request, res: Response): Promise<void> {
    const status = await settingsService.getIntegrationStatus();
    sendSuccess(res, status);
  },

  async connectTelegram(req: Request, res: Response): Promise<void> {
    const { botToken, chatId } = req.body as ConnectTelegramInput;
    await settingsService.connectTelegram(botToken, chatId);
    sendSuccess(res, { connected: true });
  },

  async disconnectTelegram(_req: Request, res: Response): Promise<void> {
    await settingsService.disconnectTelegram();
    sendSuccess(res, { connected: false });
  },
};
