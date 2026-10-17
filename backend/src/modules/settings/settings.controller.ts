import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getOrg } from "../../common/requestContext";
import { settingsService } from "./settings.service";
import { ConnectTelegramInput } from "./settings.validation";

export const settingsController = {
  async getIntegrationStatus(req: Request, res: Response): Promise<void> {
    const status = await settingsService.getIntegrationStatus(getOrg(req).id);
    sendSuccess(res, status);
  },

  async connectTelegram(req: Request, res: Response): Promise<void> {
    const { botToken, chatId } = req.body as ConnectTelegramInput;
    await settingsService.connectTelegram(getOrg(req).id, botToken, chatId);
    sendSuccess(res, { connected: true });
  },

  async disconnectTelegram(req: Request, res: Response): Promise<void> {
    await settingsService.disconnectTelegram(getOrg(req).id);
    sendSuccess(res, { connected: false });
  },
};
