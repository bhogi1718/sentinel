import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getOrg } from "../../common/requestContext";
import { eventService } from "./event.service";
import { ListEventsQuery } from "./event.validation";

export const eventController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListEventsQuery;
    const result = await eventService.listEvents(getOrg(req).id, query);
    sendSuccess(res, result);
  },
};
