/**
 * V2-6.5 RBAC — resolveUserPermissions saf fonksiyon.
 *
 * Doğrulama matrisi:
 *  - Her rol için default permission seti
 *  - override null/undefined/invalid → saf default
 *  - override.added → eklenir (rol default'unda yoksa)
 *  - override.removed → çıkarılır
 *  - added + removed birlikte
 *  - bilinmeyen rol → boş array fallback
 *  - duplicate added → tek kez
 */
import { resolveUserPermissions, hasPermission } from "./permissions.utils";
import { ROLE_DEFAULT_PERMISSIONS } from "./permissions.constants";

describe("resolveUserPermissions", () => {
  describe("role defaults (override null)", () => {
    it("COMPANY_ADMIN → 11 yetki (default)", () => {
      const perms = resolveUserPermissions("COMPANY_ADMIN", null);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.COMPANY_ADMIN);
      expect(perms).toContain("settings:users");
      expect(perms).toContain("approval:approve");
      expect(perms).not.toContain("tender:create"); // admin default'ta tender oluşturamaz
    });

    it("BUYER → 15 yetki (default), tender + bid + order operasyonu", () => {
      const perms = resolveUserPermissions("BUYER", null);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.BUYER);
      expect(perms).toContain("tender:create");
      expect(perms).toContain("tender:award");
      expect(perms).toContain("bid:eliminate");
      expect(perms).not.toContain("settings:users"); // ayarları yönetemez
    });

    it("APPROVER → 5 yetki (default), sadece onay + view", () => {
      const perms = resolveUserPermissions("APPROVER", null);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.APPROVER);
      expect(perms).toContain("approval:approve");
      expect(perms).toContain("tender:view");
      expect(perms).not.toContain("tender:create");
      expect(perms).not.toContain("bid:eliminate");
    });
  });

  describe("override null/invalid → saf default", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["string", "not-an-object"],
      ["number", 42],
      ["array", []],
    ])("%s → saf default seti döner", (_label, value) => {
      const perms = resolveUserPermissions("BUYER", value);
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.BUYER);
    });

    it("boş object {} → saf default", () => {
      const perms = resolveUserPermissions("BUYER", {});
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.BUYER);
    });
  });

  describe("override.added", () => {
    it("COMPANY_ADMIN'e tender:create ekle → 12 yetki", () => {
      const perms = resolveUserPermissions("COMPANY_ADMIN", {
        added: ["tender:create"],
      });
      expect(perms).toContain("tender:create");
      expect(perms.length).toBe(ROLE_DEFAULT_PERMISSIONS.COMPANY_ADMIN.length + 1);
    });

    it("default'ta zaten olan yetki added → duplicate edilmez", () => {
      const perms = resolveUserPermissions("BUYER", {
        added: ["tender:create"], // BUYER'ın default'unda zaten var
      });
      expect(perms.filter((p) => p === "tender:create")).toHaveLength(1);
      expect(perms.length).toBe(ROLE_DEFAULT_PERMISSIONS.BUYER.length);
    });

    it("aynı permission added array'inde 2 kez → tek kez", () => {
      const perms = resolveUserPermissions("APPROVER", {
        added: ["bid:eliminate", "bid:eliminate"],
      });
      expect(perms.filter((p) => p === "bid:eliminate")).toHaveLength(1);
    });
  });

  describe("override.removed", () => {
    it("BUYER'dan tender:delete kaldır", () => {
      const perms = resolveUserPermissions("BUYER", {
        removed: ["tender:delete"],
      });
      expect(perms).not.toContain("tender:delete");
      expect(perms.length).toBe(ROLE_DEFAULT_PERMISSIONS.BUYER.length - 1);
    });

    it("zaten yetkisi olmayan permission removed → no-op", () => {
      const perms = resolveUserPermissions("APPROVER", {
        removed: ["tender:create"], // APPROVER'da zaten yok
      });
      expect(perms).toEqual(ROLE_DEFAULT_PERMISSIONS.APPROVER);
    });
  });

  describe("override.added + removed birlikte", () => {
    it("COMPANY_ADMIN: tender:create eklenir, settings:users kaldırılır", () => {
      const perms = resolveUserPermissions("COMPANY_ADMIN", {
        added: ["tender:create"],
        removed: ["settings:users"],
      });
      expect(perms).toContain("tender:create");
      expect(perms).not.toContain("settings:users");
    });

    it("added + removed aynı permission'a işaret ederse → added kazanır (Set semantic)", () => {
      // removed önce uygulanır, added Set'e eklenir → sonuçta yetki olur
      const perms = resolveUserPermissions("BUYER", {
        added: ["tender:create"],
        removed: ["tender:create"],
      });
      expect(perms).toContain("tender:create");
    });
  });

  describe("unknown role → boş array", () => {
    it("role tablosunda olmayan değer → []", () => {
      const perms = resolveUserPermissions(
        "UNKNOWN_ROLE" as never,
        null,
      );
      expect(perms).toEqual([]);
    });

    it("unknown role + override.added → sadece added permission'ları", () => {
      const perms = resolveUserPermissions(
        "UNKNOWN_ROLE" as never,
        { added: ["tender:view"] },
      );
      expect(perms).toEqual(["tender:view"]);
    });
  });

  describe("hasPermission yardımcısı", () => {
    it("BUYER tender:create → true", () => {
      expect(hasPermission("BUYER", null, "tender:create")).toBe(true);
    });

    it("APPROVER tender:create → false", () => {
      expect(hasPermission("APPROVER", null, "tender:create")).toBe(false);
    });

    it("override.added ile yetki kazanan kullanıcı → true", () => {
      expect(
        hasPermission("COMPANY_ADMIN", { added: ["tender:create"] }, "tender:create"),
      ).toBe(true);
    });

    it("override.removed ile yetki kaybeden kullanıcı → false", () => {
      expect(
        hasPermission("BUYER", { removed: ["tender:create"] }, "tender:create"),
      ).toBe(false);
    });

    it("bilinmeyen permission → false (hiçbir rolde yok)", () => {
      expect(hasPermission("COMPANY_ADMIN", null, "nonexistent:perm")).toBe(false);
    });
  });
});
