import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { authService } from "./auth.service";
import { LoginInput, RefreshInput } from "./auth.validation";

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body as LoginInput;
    const tokens = await authService.login(email, password);
    sendSuccess(res, tokens);
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as RefreshInput;
    const tokens = await authService.refresh(refreshToken);
    sendSuccess(res, tokens);
  },

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as RefreshInput;
    await authService.logout(refreshToken);
    sendSuccess(res, { loggedOut: true });
  },

  async me(req: Request, res: Response): Promise<void> {
    sendSuccess(res, req.user);
  },
};
