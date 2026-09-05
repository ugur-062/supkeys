/**
 * Yetki tablosu (2026-09-05) — katalog, hazır setler, türetme ve guard
 * sözleşmeleri. Altı kişilik: onaylayıcı-only, görüntüleyici, Satın Almacı,
 * Satışçı, Yönetici, Kurucu.
 */
import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ALL_SEAT_PERMISSIONS,
  BUY_SEAT_PERMISSIONS,
  COMPANY_PERMISSION_CATALOG,
  COMPANY_ROLE_PRESETS,
  OWNER_ONLY_PERMISSIONS,
  VIEWER_PRESET,
  effectivePermissions,
  hasCompanyPermission,
  normalizePermissions,
  permissionsForRoles,
  rolesFromPermissions,
} from "@rothern/shared";
import { COMPANY_PERMISSION_KEY } from "../../src/modules/company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../src/modules/company-auth/guards/company-permissions.guard";

const persona = (roles: string[], isOwner = false) => ({
  isOwner,
  permissions: permissionsForRoles(roles),
  roles,
});

const APPROVER = persona(["ONAYLAYICI"]);
const VIEWER = { isOwner: false, permissions: [...VIEWER_PRESET], roles: [] as string[] };
const SA = persona(["SATIN_ALMACI"]);
const ST = persona(["SATISCI"]);
const YO = persona(["YONETICI"]);
const OWNER = persona(["SAHIP", "SATIN_ALMACI", "SATISCI"], true);
const OWNER_NO_SEAT = { isOwner: true, permissions: [] as string[], roles: [] as string[] };

describe("katalog", () => {
  it("anahtarlar tekil, işlem satırları yalnız satınalma/satış gruplarında", () => {
    const keys = COMPANY_PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of COMPANY_PERMISSION_CATALOG) {
      if (p.seat) expect(["buy", "sell"]).toContain(p.group);
    }
    expect(ALL_SEAT_PERMISSIONS).toEqual([
      "buy:listing:manage",
      "buy:award",
      "buy:order:manage",
      "buy:inquiry:send",
      "sell:bid:submit",
      "sell:order:manage",
      "sell:product:manage",
      "sell:inquiry:reply",
    ]);
  });

  it("ölü satış-ilanı anahtarları katalogda YOK; eski anahtarlar eşlenir", () => {
    const keys = COMPANY_PERMISSION_CATALOG.map((p) => p.key);
    for (const dead of ["sell:listing:create", "sell:listing:manage", "sell:award", "buy:listing:create", "buy:bid:review"]) {
      expect(keys).not.toContain(dead);
    }
    expect(normalizePermissions(["buy:listing:create", "sell:award", "bilinmeyen"])).toEqual([
      "buy:view",
      "buy:listing:manage",
    ]);
    expect(normalizePermissions(["buy:bid:review"])).toEqual(["buy:reports:view"]);
  });

  it("işlem izni grubun görüntülemesini ÖRTÜK ekler; sahibe-özel anahtar listeye yazılmaz", () => {
    expect(normalizePermissions(["sell:bid:submit"])).toEqual(["sell:view", "sell:bid:submit"]);
    expect(normalizePermissions(["billing:manage", "buy:award"])).toEqual(["buy:view", "buy:award"]);
  });
});

describe("hazır setler ↔ etiket türetme (gidiş-dönüş)", () => {
  it.each([
    [["SATIN_ALMACI"]],
    [["SATISCI"]],
    [["ONAYLAYICI"]],
    [["YONETICI"]],
    [["SATIN_ALMACI", "SATISCI"]],
    [["SATISCI", "ONAYLAYICI"]],
    [["YONETICI", "SATIN_ALMACI"]],
  ])("%j → hazır set → aynı etiketler", (roles) => {
    expect(rolesFromPermissions(permissionsForRoles(roles), false).sort()).toEqual(
      [...roles].sort(),
    );
  });

  it("Kurucu: SAHIP + işlem etiketleri; Yönetici/Onaylayıcı etiketi üretilmez", () => {
    expect(rolesFromPermissions(permissionsForRoles(["SAHIP", "SATIN_ALMACI", "SATISCI"]), true)).toEqual([
      "SAHIP",
      "SATIN_ALMACI",
      "SATISCI",
    ]);
    expect(rolesFromPermissions([], true)).toEqual(["SAHIP"]);
  });

  it("Yönetici + onaylama → tek etiket YONETICI (yönetici zaten onaylar)", () => {
    expect(rolesFromPermissions(permissionsForRoles(["YONETICI", "ONAYLAYICI"]), false)).toEqual(["YONETICI"]);
  });

  it("salt görüntüleyici: hiç etiket yok, koltuk tüketmez", () => {
    expect(rolesFromPermissions([...VIEWER_PRESET], false)).toEqual([]);
    expect(VIEWER_PRESET.some((k) => ALL_SEAT_PERMISSIONS.includes(k))).toBe(false);
  });

  it("Satın Almacı seti şablon + bağlantı taşır; Satışçı seti ürün + bilgi talebi yanıtı + iş analizi", () => {
    expect(COMPANY_ROLE_PRESETS.SATIN_ALMACI).toEqual(
      expect.arrayContaining(["templates:manage", "connections:manage", "buy:reports:view"]),
    );
    expect(COMPANY_ROLE_PRESETS.SATISCI).toEqual(
      expect.arrayContaining(["sell:product:manage", "sell:inquiry:reply", "insights:view"]),
    );
    expect(COMPANY_ROLE_PRESETS.SATIN_ALMACI).not.toContain("sell:bid:submit");
  });
});

describe("efektif izinler ve kapı", () => {
  it("onaylayıcı-only: yalnız onaylama; pano/liste/dizin/ürün uçları kapalı", () => {
    expect(effectivePermissions(APPROVER)).toEqual(["approval:act"]);
    for (const k of ["buy:view", "sell:view", "insights:view", "buy:reports:view", "connections:manage"]) {
      expect(hasCompanyPermission(APPROVER, k)).toBe(false);
    }
    expect(hasCompanyPermission(APPROVER, ["buy:view", "sell:view"])).toBe(false);
    expect(hasCompanyPermission(APPROVER, "approval:act")).toBe(true);
  });

  it("görüntüleyici: iki portalı okur, hiçbir işlem yapamaz", () => {
    expect(hasCompanyPermission(VIEWER, ["buy:view", "sell:view"])).toBe(true);
    for (const k of ALL_SEAT_PERMISSIONS) expect(hasCompanyPermission(VIEWER, k)).toBe(false);
    expect(hasCompanyPermission(VIEWER, "approval:act")).toBe(false);
  });

  it("Satın Almacı: alım tarafı tam, satış tarafı kapalı (görüntüleme dahil)", () => {
    expect(hasCompanyPermission(SA, BUY_SEAT_PERMISSIONS)).toBe(true);
    expect(hasCompanyPermission(SA, "sell:view")).toBe(false);
    expect(hasCompanyPermission(SA, "sell:bid:submit")).toBe(false);
    expect(hasCompanyPermission(SA, "users:manage")).toBe(false);
  });

  it("Satışçı: satış tarafı tam, alım tarafı kapalı", () => {
    expect(hasCompanyPermission(ST, "sell:product:manage")).toBe(true);
    expect(hasCompanyPermission(ST, "buy:view")).toBe(false);
    expect(hasCompanyPermission(ST, "buy:listing:manage")).toBe(false);
  });

  it("Yönetici: iki görüntüleme + yönetim + onay; İŞLEM yok (salt-okunur)", () => {
    expect(hasCompanyPermission(YO, ["buy:view", "sell:view"])).toBe(true);
    expect(hasCompanyPermission(YO, "approval:act")).toBe(true);
    expect(hasCompanyPermission(YO, "users:manage")).toBe(true);
    for (const k of ALL_SEAT_PERMISSIONS) expect(hasCompanyPermission(YO, k)).toBe(false);
    for (const k of OWNER_ONLY_PERMISSIONS) expect(hasCompanyPermission(YO, k)).toBe(false);
  });

  it("Kurucu: yönetim/onay/görüntüleme ÖRTÜK (liste boşken bile), işlem yalnız yazılıysa", () => {
    expect(hasCompanyPermission(OWNER_NO_SEAT, ["users:manage", "approval:act", "buy:view", "billing:manage"])).toBe(true);
    expect(hasCompanyPermission(OWNER_NO_SEAT, "buy:listing:manage")).toBe(false);
    expect(hasCompanyPermission(OWNER, "buy:listing:manage")).toBe(true);
    expect(hasCompanyPermission(OWNER, "sell:bid:submit")).toBe(true);
    for (const k of OWNER_ONLY_PERMISSIONS) expect(hasCompanyPermission(OWNER, k)).toBe(true);
  });

  it("geçiş emniyeti: izin listesi boş + rol dolu → rol hazır seti; eski anahtarla sorgu yenisine eşlenir", () => {
    const legacy = { isOwner: false, permissions: [] as string[], roles: ["SATISCI"] };
    expect(hasCompanyPermission(legacy, "sell:bid:submit")).toBe(true);
    expect(hasCompanyPermission(SA, "buy:listing:create")).toBe(true); // eski anahtar → buy:listing:manage
    expect(hasCompanyPermission(ST, "sell:listing:manage")).toBe(false); // ölü anahtar → asla
  });
});

describe("CompanyPermissionsGuard — any-of", () => {
  function ctx(user: unknown, required: unknown): ExecutionContext {
    const handler = () => undefined;
    if (required !== undefined) Reflect.defineMetadata(COMPANY_PERMISSION_KEY, required, handler);
    class Cls {}
    return {
      getHandler: () => handler,
      getClass: () => Cls,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }
  const guard = new CompanyPermissionsGuard(new Reflector());

  it("metadata yoksa geçer; dizi metadata herhangi biriyle geçer; hiçbiri yoksa 403", () => {
    expect(guard.canActivate(ctx(APPROVER, undefined))).toBe(true);
    expect(guard.canActivate(ctx(SA, ["buy:view", "sell:view"]))).toBe(true);
    expect(() => guard.canActivate(ctx(APPROVER, ["buy:view", "sell:view"]))).toThrow(/yetkiniz yok/);
    expect(() => guard.canActivate(ctx(undefined, "buy:view"))).toThrow(/Yetkisiz/);
  });
});
