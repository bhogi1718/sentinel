import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { commandService } from "./command.service";
import { CreateCommandInput } from "./command.validation";

export const commandController = {
  async create(req: Request, res: Response): Promise<void> {
    const { type } = req.body as CreateCommandInput;
    const command = await commandService.sendCommand(type);
    sendSuccess(res, command, 202);
  },
};
