import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./permissions";

// The dashboard keeps its own copy of the permission names (it can't import
// backend code), used to type its role checks. This fails the backend test
// run the moment the two lists differ, instead of letting them drift.

const FRONTEND_PERMISSIONS_FILE = path.resolve(__dirname, "../../../frontend/src/api/organization.api.ts");

function frontendPermissions(): string[] {
  const source = readFileSync(FRONTEND_PERMISSIONS_FILE, "utf8");
  const list = /export const PERMISSIONS = \[([\s\S]*?)\] as const;/.exec(source);
  if (!list) throw new Error(`No PERMISSIONS array found in ${FRONTEND_PERMISSIONS_FILE}`);
  return [...list[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe("permission names shared with the dashboard", () => {
  it("match the backend's permission table exactly", () => {
    expect(frontendPermissions().sort()).toEqual(Object.keys(PERMISSIONS).sort());
  });
});
