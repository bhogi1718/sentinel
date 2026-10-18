import { apiClient } from "./client";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUser {
  id: string;
  email: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  organizationName?: string;
  /// Signing up from an invite link: join that organization instead.
  inviteToken?: string;
}

export const authApi = {
  async signup(input: SignupInput): Promise<AuthTokens> {
    const response = await apiClient.post<{ success: true; data: AuthTokens }>("/auth/signup", input);
    return response.data.data;
  },

  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await apiClient.post<{ success: true; data: AuthTokens }>("/auth/login", { email, password });
    return response.data.data;
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const response = await apiClient.post<{ success: true; data: AuthTokens }>("/auth/refresh", { refreshToken });
    return response.data.data;
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post("/auth/logout", { refreshToken });
  },

  async me(): Promise<CurrentUser> {
    const response = await apiClient.get<{ success: true; data: CurrentUser }>("/auth/me");
    return response.data.data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post("/auth/change-password", { currentPassword, newPassword });
  },
};
