import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { authApi } from "@/api/auth.api";
import type { CurrentUser } from "@/api/auth.api";
import { getAccessToken, setAccessToken, setUnauthorizedHandler } from "@/api/client";
import { tokenStorage } from "@/api/tokenStorage";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Everything cached belongs to whoever was signed in: their organizations,
  // roles, devices and events. Dropped whenever the signed-in user changes or
  // signs out, so the next user in this browser never sees a previous
  // user's data, even for a moment.
  const clearUserData = useCallback(() => {
    queryClient.clear();
  }, [queryClient]);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Best-effort revoke; local state is cleared regardless.
      }
    }
    setAccessToken(null);
    tokenStorage.clearRefreshToken();
    clearUserData();
    setUser(null);
  }, [clearUserData]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearUserData();
      setUser(null);
    });
  }, [clearUserData]);

  useEffect(() => {
    async function restoreSession(): Promise<void> {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        const tokens = await authApi.refresh(refreshToken);
        setAccessToken(tokens.accessToken);
        tokenStorage.setRefreshToken(tokens.refreshToken);
        const currentUser = await authApi.me();
        setUser(currentUser);
      } catch {
        setAccessToken(null);
        tokenStorage.clearRefreshToken();
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await authApi.login(email, password);
      clearUserData();
      setAccessToken(tokens.accessToken);
      tokenStorage.setRefreshToken(tokens.refreshToken);
      const currentUser = await authApi.me();
      setUser(currentUser);
    },
    [clearUserData],
  );

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null && getAccessToken() !== null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
