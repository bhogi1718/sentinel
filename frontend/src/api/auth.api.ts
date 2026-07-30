import { apiClient } from "./client";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUser {
  id: string;
  email: string;
}

export const authApi = {
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
};
