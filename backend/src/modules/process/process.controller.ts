import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { processService } from "./process.service";

export const processController = {
  async list(_req: Request, res: Response): Promise<void> {
    const processes = await processService.listProcesses();
    sendSuccess(res, processes);
  },
};
