import { describe, expect, it } from "vitest";
import { canAdminDo, ADMIN_ACTION_ROLES } from "../admin-permissions";

describe("canAdminDo (F7: backend @RequireAdminRole ile birebir)", () => {
  it("ücretsiz dönem: üyelik yönetimi aksiyonları matriste yok (ekranlar kaldırıldı)", () => {
    for (const a of ["setTier", "extendMembership", "viewMembershipReport"]) {
      expect(Object.keys(ADMIN_ACTION_ROLES)).not.toContain(a);
    }
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
  it("addNote/notify SUPER_ADMIN+SALES", () => {
    for (const a of ["addNote", "notify"] as const) {
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
    expect(canAdminDo(undefined, "suspend")).toBe(false);
  });
  it("her aksiyon en az bir role izinli (boş matris satırı yok)", () => {
    for (const roles of Object.values(ADMIN_ACTION_ROLES)) {
      expect(roles.length).toBeGreaterThan(0);
    }
  });
});

describe("globalSearch (derin denetim MU-21 — GET admin/search SUPER_ADMIN+SALES)", () => {
  it("SUPPORT üst çubuk aramasını görmez (her tuşta 403 toast'ı üretiyordu)", () => {
    expect(canAdminDo("SUPER_ADMIN", "globalSearch")).toBe(true);
    expect(canAdminDo("SALES", "globalSearch")).toBe(true);
    expect(canAdminDo("SUPPORT", "globalSearch")).toBe(false);
  });
});

describe("inceleme/sistem aksiyonları (derin denetim LU-12 — düğmeler 403 veriyordu)", () => {
  it("ilan müdahalesi, sipariş iptali ve kur yenileme SUPER_ADMIN+SALES — SUPPORT görmez", () => {
    for (const a of ["listingIntervention", "cancelOrder", "refreshRates"] as const) {
      expect(canAdminDo("SUPER_ADMIN", a)).toBe(true);
      expect(canAdminDo("SALES", a)).toBe(true);
      expect(canAdminDo("SUPPORT", a)).toBe(false);
    }
  });
  it("ürün kararı SUPER_ADMIN+SUPPORT — SALES yalnız okur", () => {
    expect(canAdminDo("SUPER_ADMIN", "reviewProduct")).toBe(true);
    expect(canAdminDo("SUPPORT", "reviewProduct")).toBe(true);
    expect(canAdminDo("SALES", "reviewProduct")).toBe(false);
  });
  it("engel kaldırma yalnız SUPER_ADMIN (liste SALES'e açık olsa da)", () => {
    expect(canAdminDo("SALES", "listSuppressions")).toBe(true);
    expect(canAdminDo("SALES", "clearSuppression")).toBe(false);
  });
});
