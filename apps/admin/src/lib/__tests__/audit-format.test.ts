import { describe, expect, it } from "vitest";
import { safeFormat } from "../date";
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
  describe("yeniden doğrulama webC-14 — kalan ham anahtarlar", () => {
    it("belge incelemesi: depolama yolu yok, belge adları ve kararlar etiketli", () => {
      const s = formatAuditMetadata("admin.company.docs_reviewed", {
        from: "PENDING",
        keys: {
          idBack: "company-docs/rv_c11_b/idBack-cf53.pdf",
          taxPlate: "company-docs/rv_c11_b/taxPlate-1.pdf",
        },
        status: "REJECTED",
        rejected: true,
        decisions: { idBack: "APPROVED", taxPlate: "REJECTED" },
      });
      expect(s).not.toContain("company-docs/");
      expect(s).not.toMatch(/keys|decisions|idBack|taxPlate/);
      expect(s).toBe(
        "önce: İnceleme Bekliyor · belgeler: Yetkili kimlik (arka), Vergi levhası · durum: Reddedildi · red var: evet · kararlar: (Yetkili kimlik (arka): Onaylı · Vergi levhası: Reddedildi)",
      );
    });

    it("admin profil düzenlemesi: alan adı ve önce → sonra (iç içe '…' yok)", () => {
      expect(
        formatAuditMetadata("admin.company.profile_updated", {
          changes: { industry: { to: "Makina", from: null }, website: { from: "a.com", to: "b.com" } },
        }),
      ).toBe("değişiklikler: sektör (— → Makina), web sitesi (a.com → b.com)");
    });

    it("iç kimlikler gizlenir; sürüm/gönderim anahtarları etiketli", () => {
      const s = formatAuditMetadata("company.bid.submitted", {
        version: 4,
        listingId: "cmuqw6y0q043nrbg6hmdvb6cz",
        submitCount: 2,
        resubmission: true,
        listingNumber: "ROT-000768",
      });
      expect(s).toBe("sürüm: 4 · gönderim sayısı: 2 · yeniden gönderim: evet · ilan no: ROT-000768");
      expect(
        formatAuditMetadata("ai.action_executed", {
          via: "ai_assistant",
          actionId: "0726a3ca",
          sessionId: "cmuqoxvgc",
          actionType: "send_invites",
          resourceId: "cmuqotiw2",
        }),
      ).toBe("kanal: AI asistan · eylem türü: Davet gönderme");
      // Firmanın herkese açık kodu kimlik sayılmaz.
      expect(formatAuditMetadata("admin.company.deleted", { rothernId: "92BT-BH7W" })).toBe(
        "Rothern kodu: 92BT-BH7W",
      );
    });

    it("tarihler okunur biçimde; takvim günü saatsiz", () => {
      expect(
        formatAuditMetadata("company.order.accepted", {
          bankAccountId: "cmug1",
          expectedDeliveryDate: "2026-10-16T09:22:10.150Z",
          orderNumber: "ROT-ORD-1",
        }),
      ).toBe("beklenen teslim: 16 Eki 2026 · sipariş no: ROT-ORD-1");
      const from = "2026-10-20T09:00:00.000Z";
      const to = "2026-10-25T09:00:00.000Z";
      expect(formatAuditMetadata("admin.listing.extended", { to, from })).toBe(
        `sonra: ${safeFormat(to, "d MMM yyyy HH:mm")} · önce: ${safeFormat(from, "d MMM yyyy HH:mm")}`,
      );
      expect(formatAuditMetadata("admin.listing.reopened", { closesAt: from })).not.toMatch(/T09|Z$/);
      expect(formatAuditMetadata("admin.system.rates_refreshed", { date: "2026-10-01" })).toBe(
        "tarih: 1 Eki 2026",
      );
    });

    it("kaynak kodları, belge türü ve talep varsayılanı alanları etiketli", () => {
      expect(
        formatAuditMetadata("connection.external_tender_invite", { queued: 1, skipped: 0, source: "AI_AUTO" }),
      ).toBe("kuyruğa alınan: 1 · atlanan: 0 · kaynak: AI (otomatik)");
      expect(formatAuditMetadata("company.docs.uploaded", { kind: "idBack" })).toBe(
        "tür: Yetkili kimlik (arka)",
      );
      expect(
        formatAuditMetadata("company.listing_document.added", { kind: "TEKNIK_SARTNAME", fileName: "a.pdf" }),
      ).toBe("tür: Teknik şartname · dosya: a.pdf");
      const s = formatAuditMetadata("company.request_defaults.updated", {
        changedFields: ["visibility", "deliveryTerm", "isSealedBid"],
      });
      expect(s).toBe("değişen alanlar: görünürlük, teslim şekli, kapalı zarf (eski ayar)");
      expect(formatAuditMetadata("company.vies_checked", { source: "manual", valid: false })).toBe(
        "kaynak: Elle · geçerli: hayır",
      );
    });

    it("gerçek denetim kayıtlarındaki anahtarların tamamı etiketli ya da gizli", () => {
      // Yerel test yığınındaki audit_logs tablosundan toplanan anahtar kümesi
      // (2026-10-02); süreölçer yapılandırması sayısal ayardır, kapsam dışı.
      const seen = [
        "failed", "sent", "skipped", "subject", "country", "dedupeKey", "delivered", "email",
        "emailQueued", "targets", "tier", "truncated", "name", "retainedBecause", "rothernId", "kind",
        "status", "decisions", "from", "keys", "rejected", "rowCounts", "months", "noteId", "body",
        "companyId", "changes", "complaintId", "reason", "via", "suspend", "to", "closesAt",
        "listingId", "listingLeftWithoutLiveOrder", "bulk", "wasPublic", "role", "started", "note",
        "query", "currency", "rate", "date", "success", "entities", "enabled", "enqueued",
        "setupEmailSent", "actionId", "actionType", "resourceId", "sessionId", "portal",
        "twoFactorSetupRequired", "city", "isDefault", "title", "type", "changedFields", "isFinal",
        "stepId", "stepOrder", "approverUserIds", "listingType", "stepCount", "statusBefore",
        "sourceFlowId", "wasActive", "bankName", "ibanMasked", "bidId", "fileName", "amount",
        "listingNumber", "resubmission", "round", "submitCount", "version", "additionalDays",
        "revived", "validityDays", "validUntil", "added", "code", "isPublic", "reReview",
        "inviteeCompanyId", "inviterCompanyId", "origin", "referralInviteId", "blockedCompanyId",
        "blockerCompanyId", "actorCompanyId", "counterpartyCompanyId", "kycFields", "resetDocs",
        "invited", "approverUserId", "bidAmount", "bidCurrency", "bidderCompanyId", "buyerCompanyId",
        "byItem", "newBidStatus", "orderNumber", "previousBidStatus", "sellerCompanyId", "viaApproval",
        "lost", "orderId", "reopened", "restored", "itemId", "needed", "carryBids",
        "eliminateNonBidders", "fromRound", "newFormat", "toRound", "visibility", "bankAccountId",
        "expectedDeliveryDate", "buyerReason", "sellerReason", "source", "autoCompleted",
        "invoiceNumber", "fromUserId", "previousOwnerRoles", "toUserId", "slug", "website",
        "usingSearch", "droppedCount", "keptCount", "limit", "invitationId", "invitedById",
        "permissions", "roles", "attemptedRoles", "after", "before", "removed", "rolesAfter",
        "rolesBefore", "previousRoles", "droppedGroups", "labelChanges", "roleChanges", "address",
        "countryCode", "unavailable", "valid", "vatNumber", "queued", "newLogId", "template",
        "toEmail", "active",
      ];
      const sameInTurkish = new Set(["portal"]);
      const raw = seen.filter((k) => {
        if (sameInTurkish.has(k)) return false;
        const out = formatAuditMetadata("x.y", { [k]: 1 });
        return out !== "" && out.startsWith(`${k}:`);
      });
      expect(raw).toEqual([]);
    });
  });
});
