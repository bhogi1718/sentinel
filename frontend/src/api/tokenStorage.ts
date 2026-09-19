const REFRESH_TOKEN_KEY = "sentinel_refresh_token";

export const tokenStorage = {
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setRefreshToken(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },

  clearRefreshToken(): void {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
