import { describe, expect, it } from "vitest";
import { canAdminDo, ADMIN_ACTION_ROLES } from "../admin-permissions";

describe("canAdminDo (F7: backend @RequireAdminRole ile birebir)", () => {
  it("setTier yalnız SUPER_ADMIN — SALES görmez", () => {
    expect(canAdminDo("SUPER_ADMIN", "setTier")).toBe(true);
    expect(canAdminDo("SALES", "setTier")).toBe(false);
    expect(canAdminDo("SUPPORT", "setTier")).toBe(false);
  });
  it("suspend/unsuspend/deleteNote/manageStaff/announce yalnız SUPER_ADMIN", () => {
    for (const a of [
      "suspend",
      "unsuspend",
      "deleteNote",
      "manageStaff",
      "announce",
      "deleteCompany",
    ] as const) {
      expect(canAdminDo("SUPER_ADMIN", a)).toBe(true);
      expect(canAdminDo("SALES", a)).toBe(false);
    }
  });
  it("resolveComplaint SUPER_ADMIN+SALES — SUPPORT görmez", () => {
    expect(canAdminDo("SUPER_ADMIN", "resolveComplaint")).toBe(true);
    expect(canAdminDo("SALES", "resolveComplaint")).toBe(true);
    expect(canAdminDo("SUPPORT", "resolveComplaint")).toBe(false);
  });
  it("extendMembership/addNote/notify SUPER_ADMIN+SALES", () => {
    for (const a of ["extendMembership", "addNote", "notify"] as const) {
      expect(canAdminDo("SALES", a)).toBe(true);
      expect(canAdminDo("SUPPORT", a)).toBe(false);
    }
  });
  it("recoverAccount tüm roller (AllowAnyAdminRole)", () => {
    expect(canAdminDo("SUPPORT", "recoverAccount")).toBe(true);
    expect(canAdminDo("SALES", "recoverAccount")).toBe(true);
    expect(canAdminDo("SUPER_ADMIN", "recoverAccount")).toBe(true);
  });
  it("rol yoksa (null/undefined) her aksiyon false", () => {
    expect(canAdminDo(null, "recoverAccount")).toBe(false);
    expect(canAdminDo(undefined, "setTier")).toBe(false);
  });
  it("her aksiyon en az bir role izinli (boş matris satırı yok)", () => {
    for (const roles of Object.values(ADMIN_ACTION_ROLES)) {
      expect(roles.length).toBeGreaterThan(0);
    }
  });
});
