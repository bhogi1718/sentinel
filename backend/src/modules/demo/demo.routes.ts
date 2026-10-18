import { Request, Response, Router } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { asyncHandler } from "../../common/asyncHandler";
import { demoSessionRateLimiter } from "../../middleware/rateLimiter";
import { demoService } from "./demo.service";

/// Mounted at /api/demo. Public: these are how a visitor without an
/// account gets into the demo.
export const demoRouter = Router();

/// Whether this deployment offers the demo, so the dashboard can show or
/// hide its "Try the demo" button.
demoRouter.get("/", (_req: Request, res: Response) => {
  sendSuccess(res, { enabled: demoService.isEnabled() });
});

demoRouter.post(
  "/session",
  demoSessionRateLimiter,
  asyncHandler(async (_req: Request, res: Response) => {
    const tokens = await demoService.createSession();
    sendSuccess(res, tokens, 201);
  }),
);
