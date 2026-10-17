import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getDevice, getUser } from "../../common/requestContext";
import { commandService } from "./command.service";
import { CreateCommandInput, ListCommandsQuery } from "./command.validation";

export const commandController = {
  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateCommandInput;
    const command = await commandService.sendCommand(getDevice(req), input, getUser(req).id);
    sendSuccess(res, command, 202);
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListCommandsQuery;
    const result = await commandService.listForDevice(getDevice(req), query);
    sendSuccess(res, result);
  },
};
