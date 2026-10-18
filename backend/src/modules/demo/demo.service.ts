import { ApiError } from "../../common/ApiError";
import { env } from "../../config/env";
import { DEMO_USER } from "../../demo/demoSetup";
import { authRepository } from "../auth/auth.repository";
import { authService } from "../auth/auth.service";
import { AuthTokens } from "../auth/auth.types";

export const demoService = {
  isEnabled(): boolean {
    return env.DEMO_MODE;
  },

  /// Signs the caller in as the shared demo visitor, who belongs to the demo
  /// organization only - so every tenant check that protects real
  /// organizations applies to demo sessions unchanged.
  async createSession(): Promise<AuthTokens> {
    if (!env.DEMO_MODE) throw ApiError.notFound("The demo is not available");

    const visitor = await authRepository.findUserByEmail(DEMO_USER.email);
    if (!visitor) throw ApiError.notFound("The demo is not available");

    return authService.issueSession({ id: visitor.id, email: visitor.email });
  },
};
