import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { commandService } from "./command.service";
import { CreateCommandInput } from "./command.validation";

export const commandController = {
  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateCommandInput;
    const command = await commandService.sendCommand(input);
    sendSuccess(res, command, 202);
  },
};
