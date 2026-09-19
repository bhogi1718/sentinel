import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { validateRequest } from "../../middleware/validateRequest";
import { eventController } from "./event.controller";
import { listEventsSchema } from "./event.validation";

export const eventRouter = Router();

eventRouter.get("/", authGuard, validateRequest(listEventsSchema), asyncHandler(eventController.list));
