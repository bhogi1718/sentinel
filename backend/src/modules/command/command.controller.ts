import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getAuditSubject, getDevice, getUser } from "../../common/requestContext";
import { auditService } from "../audit/audit.service";
import { commandService } from "./command.service";
import { CreateCommandInput, ListCommandsQuery } from "./command.validation";

export const commandController = {
  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateCommandInput;
    const detail = input.type === "KILL_PROCESS" ? { command: input.type, pid: input.pid, processName: input.name } : { command: input.type };
    const command = await auditService.track(
      getAuditSubject(req),
      "COMMAND_SENT",
      () => commandService.sendCommand(getDevice(req), input, getUser(req).id),
      detail,
    );
    sendSuccess(res, command, 202);
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListCommandsQuery;
    const result = await commandService.listForDevice(getDevice(req), query);
    sendSuccess(res, result);
  },
};
