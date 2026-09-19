export interface JwtAccessPayload {
  sub: string;
  email: string;
  type: "access";
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}
