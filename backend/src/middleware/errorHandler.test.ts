import { describe, expect, it } from "vitest";
import { redactSensitiveQueryParams } from "./errorHandler";

describe("redactSensitiveQueryParams", () => {
  it("redacts a token query param", () => {
    const result = redactSensitiveQueryParams("/api/files/download?path=a.txt&token=eyJhbGciOiJIUzI1NiJ9.secret");
    expect(result).toBe("/api/files/download?path=a.txt&token=%5BREDACTED%5D");
    expect(result).not.toContain("eyJ");
  });

  it("leaves URLs with no query string untouched", () => {
    expect(redactSensitiveQueryParams("/api/device/status")).toBe("/api/device/status");
  });

  it("leaves non-sensitive query params untouched", () => {
    const result = redactSensitiveQueryParams("/api/events?page=2&limit=50");
    expect(result).toBe("/api/events?page=2&limit=50");
  });

  it("redacts token even when it is not the only param", () => {
    const result = redactSensitiveQueryParams("/api/files/download?token=abc123&path=%2Fetc%2Fpasswd");
    expect(result).toContain("token=%5BREDACTED%5D");
    expect(result).not.toContain("abc123");
  });
});
