import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app";

// DEMO_MODE is unset in tests (see src/test/setupEnv.ts), so this is a
// deployment that hasn't opted in to the public demo.

describe("demo endpoints when demo mode is off", () => {
  const app = createApp();

  it("report the demo as unavailable", async () => {
    const res = await request(app).get("/api/demo");
    expect((res.body as { data: { enabled: boolean } }).data).toEqual({ enabled: false });
  });

  it("refuse to start a demo session", async () => {
    const res = await request(app).post("/api/demo/session");
    expect(res.status).toBe(404);
  });
});
