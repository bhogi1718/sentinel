import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getDevice, getOrg, getUser } from "../../common/requestContext";
import { deviceService } from "./device.service";

export const deviceController = {
  async list(req: Request, res: Response): Promise<void> {
    const devices = await deviceService.listForOrg(getOrg(req).id);
    sendSuccess(res, devices);
  },

  // req.device is already loaded and authorized by deviceContext, but
  // asyncHandler requires every handler to return a Promise.
  // eslint-disable-next-line @typescript-eslint/require-await
  async get(req: Request, res: Response): Promise<void> {
    sendSuccess(res, getDevice(req));
  },

  async remove(req: Request, res: Response): Promise<void> {
    await deviceService.remove(getDevice(req), getUser(req));
    sendSuccess(res, null);
  },
};
