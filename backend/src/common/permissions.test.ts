import { describe, expect, it } from "vitest";
import { can, Permission, permissionsFor, PERMISSIONS } from "./permissions";

const READ_ONLY: Permission[] = ["org:view", "members:view", "devices:view", "processes:view"];
const DEVICE_CONTROL: Permission[] = [
  "files:access",
  "screen:view",
  "commands:send",
  "devices:manage",
  "settings:manage",
  "audit:view",
];
const OWNER_ONLY: Permission[] = ["members:manage", "org:manage"];

describe("can", () => {
  it("lets a VIEWER read but not touch devices, private data or the organization", () => {
    for (const permission of READ_ONLY) expect(can("VIEWER", permission)).toBe(true);
    for (const permission of [...DEVICE_CONTROL, ...OWNER_ONLY]) expect(can("VIEWER", permission)).toBe(false);
  });

  it("lets an ADMIN control devices but not manage members or the organization", () => {
    for (const permission of [...READ_ONLY, ...DEVICE_CONTROL]) expect(can("ADMIN", permission)).toBe(true);
    for (const permission of OWNER_ONLY) expect(can("ADMIN", permission)).toBe(false);
  });

  it("lets an OWNER do everything", () => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) expect(can("OWNER", permission)).toBe(true);
  });

  it("covers every permission in the table with the groups above", () => {
    expect([...READ_ONLY, ...DEVICE_CONTROL, ...OWNER_ONLY].sort()).toEqual(Object.keys(PERMISSIONS).sort());
  });
});

describe("the demo organization", () => {
  it("lets demo visitors try devices, but never change the shared demo", () => {
    const scope = { isDemo: true };
    for (const permission of [...READ_ONLY, "files:access", "screen:view", "commands:send", "audit:view"] as Permission[]) {
      expect(can("OWNER", permission, scope)).toBe(true);
    }
    for (const permission of ["devices:manage", "settings:manage", "members:manage", "org:manage"] as Permission[]) {
      expect(can("OWNER", permission, scope)).toBe(false);
    }
  });

  it("restricts nothing outside the demo organization", () => {
    expect(permissionsFor("OWNER", { isDemo: false }).sort()).toEqual(Object.keys(PERMISSIONS).sort());
  });
});

describe("permissionsFor", () => {
  it("returns exactly the permissions can() grants", () => {
    expect(permissionsFor("VIEWER").sort()).toEqual([...READ_ONLY].sort());
    expect(permissionsFor("ADMIN").sort()).toEqual([...READ_ONLY, ...DEVICE_CONTROL].sort());
    expect(permissionsFor("OWNER").sort()).toEqual(Object.keys(PERMISSIONS).sort());
  });
});
