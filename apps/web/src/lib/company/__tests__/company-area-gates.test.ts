/**
 * Şirketim alanı ve menü kapıları — rol kontrolü paket kontrolünün İÇİNDE
 * (arayüz testi webC-06: O-043, O-062, O-101, O-108).
 */
import { describe, expect, it } from "vitest";
import {
  COMPANY_AREA,
  COMPANY_AREA_PERMISSIONS,
  COMPANY_PROFILE_PERMISSIONS,
  isNavItemLocked,
  navItemMinTier,
} from "../portals";
import { userHasPermission } from "../permissions";

const item = (href: string) => {
  const found = COMPANY_AREA.nav.find((i) => i.href === href);
  if (!found) throw new Error(`nav item missing: ${href}`);
  return found;
};
const reports = item("/company/sirketim/raporlar");
const profile = item("/company/sirketim/profil");
const overview = item("/company/sirketim");
const u = (...permissions: string[]) => ({ permissions, roles: [], isOwner: false });

describe("Raporlar menü kilidi kişinin iznine göre (O-043)", () => {
  it("yalnız insights:view → Silver; yalnız buy:reports:view → Gold; ikisi → Silver", () => {
    expect(navItemMinTier(reports, u("insights:view"))).toBe("SILVER");
    expect(navItemMinTier(reports, u("buy:reports:view"))).toBe("GOLD");
    expect(navItemMinTier(reports, u("insights:view", "buy:reports:view"))).toBe("SILVER");
  });

  it("SILVER firmada yalnız satınalma raporu izni olana satır kilitli", () => {
    expect(isNavItemLocked(reports, u("buy:reports:view"), "SILVER")).toBe(true);
    expect(isNavItemLocked(reports, u("insights:view"), "SILVER")).toBe(false);
    expect(isNavItemLocked(reports, u("buy:reports:view"), "GOLD")).toBe(false);
    expect(isNavItemLocked(reports, u("insights:view"), "STANDART")).toBe(true);
  });

  it("izin tablosu olmayan satır sabit minTier'ı kullanır", () => {
    expect(navItemMinTier(profile, u("company:manage"))).toBeUndefined();
  });
});

describe("Şirketim alan/profil izinleri tek sabitten (O-062, O-101, O-108)", () => {
  it("alan kapısı tek izinli ziyaretçi ve rapor kullanıcısını kabul eder", () => {
    expect(userHasPermission(u("insights:view"), COMPANY_AREA_PERMISSIONS)).toBe(true);
    expect(userHasPermission(u("buy:reports:view"), COMPANY_AREA_PERMISSIONS)).toBe(true);
    expect(userHasPermission(u("approval:act"), COMPANY_AREA_PERMISSIONS)).toBe(false);
  });

  it("Profil satırı API profil ucunun izinleriyle çizilir", () => {
    expect(profile.permission).toEqual(COMPANY_PROFILE_PERMISSIONS);
    expect(userHasPermission(u("users:manage"), profile.permission!)).toBe(false);
    expect(userHasPermission(u("sell:view"), profile.permission!)).toBe(true);
  });

  it("Genel Bakış satırı alan kapısıyla aynı izinler", () => {
    expect(overview.permission).toEqual(COMPANY_AREA_PERMISSIONS);
  });
});
