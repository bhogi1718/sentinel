import { Request, Response } from "express";
import { ApiError } from "../../common/ApiError";
import { sendSuccess } from "../../common/ApiResponse";
import { deviceRepository } from "./device.repository";

export const deviceController = {
  async getStatus(_req: Request, res: Response): Promise<void> {
    const device = await deviceRepository.findFirst();
    if (!device) {
      throw ApiError.notFound("No device has been registered yet");
    }

    sendSuccess(res, {
      id: device.id,
      name: device.name,
      isOnline: device.isOnline,
      lastSeenAt: device.lastSeenAt,
    });
  },
};
