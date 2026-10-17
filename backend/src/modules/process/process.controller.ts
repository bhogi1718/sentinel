import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getDevice } from "../../common/requestContext";
import { processService } from "./process.service";

export const processController = {
  async list(req: Request, res: Response): Promise<void> {
    const processes = await processService.listProcesses(getDevice(req));
    sendSuccess(res, processes);
  },
};
