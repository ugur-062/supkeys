import { describe, expect, it } from "vitest";
import {
  actorMeta,
  entityTypeLabel,
  formatAuditMetadata,
  LOGIN_FAIL_REASON_LABEL,
} from "../audit-format";

/** Denetim satırı biçimleyicisi (arayüz testi O-047, D-016, D-019). */
describe("audit-format", () => {
  it("sipariş durum geçişi etiketli yazılır (ham 'to: CANCELLED · from: DISPUTED' değil)", () => {
    expect(
      formatAuditMetadata("admin.order.cancelled", { to: "CANCELLED", from: "DISPUTED" }),
    ).toBe("sonra: İptal · önce: İhtilaflı");
  });

  it("değişen alanlar anahtar ve alan etiketiyle yazılır (ham JSON değil)", () => {
    const s = formatAuditMetadata("company.profile.updated", {
      changedFields: ["name", "website", "unknownField"],
    });
    expect(s).toBe("değişen alanlar: ad, web sitesi, unknownField");
    expect(s).not.toContain("{");
  });

  it("aynı kod eylem ailesine göre doğru sözlükten çevrilir", () => {
    expect(formatAuditMetadata("admin.company.verification_set", { to: "PENDING" })).toBe(
      "sonra: İnceleme Bekliyor",
    );
    expect(formatAuditMetadata("company.order.cancelled", { to: "PENDING" })).toBe(
      "sonra: Satıcı onayı bekliyor",
    );
    expect(formatAuditMetadata("admin.company.tier_set", { tier: "GOLD", from: "STANDART" })).toBe(
      "paket: Gold · önce: Standart",
    );
  });

  it("portal, giriş hatası, mantıksal ve iç içe değerler; bilinmeyen ham kalır", () => {
    expect(
      formatAuditMetadata("auth.login_failed", { reason: "bad_credentials", portal: "company" }),
    ).toBe("gerekçe: Hatalı e-posta veya şifre · portal: Firma paneli");
    expect(formatAuditMetadata("x.y", { isDefault: true, custom: "abc", nil: null })).toBe(
      "varsayılan: evet · custom: abc",
    );
    expect(formatAuditMetadata("x.y", { before: { status: "OPEN" } })).toBe("önce: (durum: Açık)");
    expect(formatAuditMetadata("x.y", null)).toBe("");
  });

  it("aktör ve varlık etiketleri (büyük harf varlık dahil)", () => {
    expect(actorMeta("company").label).toBe("Firma");
    expect(actorMeta("weird").label).toBe("weird");
    expect(entityTypeLabel("company_order")).toBe("Sipariş");
    expect(entityTypeLabel("listing_bid")).toBe("Teklif");
    expect(entityTypeLabel("COMPANY")).toBe("Firma");
    expect(entityTypeLabel("zzz")).toBe("zzz");
  });

  it("API'nin yazdığı her giriş-hatası nedeni etiketli (D-019)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const api = join(__dirname, "..", "..", "..", "..", "api", "src", "modules");
    const reasons = new Set<string>();
    for (const f of [
      "company-auth/services/company-auth.service.ts",
      "admin-auth/admin-auth.service.ts",
    ]) {
      for (const m of readFileSync(join(api, f), "utf8").matchAll(/auditFail\("([a-z0-9_]+)"\)/g)) {
        reasons.add(m[1]!);
      }
    }
    expect(reasons.size).toBeGreaterThan(5);
    expect([...reasons].filter((r) => !LOGIN_FAIL_REASON_LABEL[r])).toEqual([]);
  });
});
