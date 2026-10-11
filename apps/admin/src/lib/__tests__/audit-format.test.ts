import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeFormat } from "../date";
import {
  actorMeta,
  entityTypeLabel,
  formatAuditMetadata,
  LOGIN_FAIL_REASON_LABEL,
} from "../audit-format";
import { COMPANY_PERMISSION_LABEL } from "../terms";

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
      "üyelik (eski): Üst kademe · önce: Temel",
    );
    // Üyelik kaldırma satırı (eski) ay göstermez (eski kayıt months: 12 taşısa da).
    expect(
      formatAuditMetadata("admin.company.tier_set", { from: "GOLD", tier: "STANDART", months: 12 }),
    ).toBe("önce: Üst kademe · üyelik (eski): Temel");
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

    it("otomatik üye daveti izi Türkçe: 'auto' ham anahtar olarak basılmaz", () => {
      // Yayın sonrası keşif turu `{ invited, auto: true }` yazar; `auto`
      // etiketsizken Detay hücresi "davet edilen: 1 · auto: evet" basıyordu.
      expect(formatAuditMetadata("company.listing.ai_member_invited", { invited: 1, auto: true })).toBe(
        "davet edilen: 1 · otomatik (yayın sonrası tur): evet",
      );
    });

    it("üye daveti izinin yazdığı HER metadata anahtarı etiketli (API kaynağı taranır)", () => {
      const src = readFileSync(
        path.resolve(
          __dirname,
          "../../../../../apps/api/src/modules/company-listings/services/company-listings.service.ts",
        ),
        "utf8",
      );
      const at = src.indexOf('action: "company.listing.ai_member_invited"');
      expect(at).toBeGreaterThan(0);
      const block = src.slice(at, at + 600).match(/\bmetadata:\s*\{([^;]*?)\},?\s*\}\);/)?.[1] ?? "";
      const keys = [...block.matchAll(/(?:^|[,{(])\s*([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]!);
      // Tarama gerçekten bir şey buluyor (iz yeniden yazılırsa sessizce boş geçmesin).
      expect([...new Set(keys)].sort()).toEqual(expect.arrayContaining(["auto", "invited"]));
      const raw = [...new Set(keys)].filter((k) =>
        formatAuditMetadata("company.listing.ai_member_invited", { [k]: 1 }).startsWith(`${k}:`),
      );
      expect(raw).toEqual([]);
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
        // İç içe nesnelerin anahtarları (rowCounts, retainedBecause, enqueued,
        // roleChanges) — Detay'da da anahtar adıyla görünür (webC-4).
        "added", "removed", "users", "listings", "adminNotes", "bidsPlaced", "bankAccounts",
        "ordersAsBuyer", "ordersAsSeller", "complaintsReceived", "complaintsMade",
        "membershipEvents", "listingInvitations", "products", "companies",
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

  // Son tur (webC-4): 143 eylemlik taramada kalan ham enum/anahtar örnekleri.
  describe("son tur webC-4 — kalan ham kodlar", () => {
    it("çeviri doldurma satırları Türkçe: iç içe sayaç anahtarları ve başlamama gerekçesi", () => {
      expect(
        formatAuditMetadata("admin.system.translation_backfill", {
          enabled: false,
          enqueued: { listings: 0, products: 3, companies: 1 },
        }),
      ).toBe("açık: hayır · kuyruğa alınan: (ilan: 0 · ürün: 3 · firma: 1)");
      for (const action of [
        "admin.system.category_translation_backfill",
        "admin.system.attribute_translation_backfill",
      ]) {
        // Güncel API kodu ve eski satırların İngilizce cümlesi aynı etiketi alır.
        for (const reason of ["provider_not_configured", "translation provider not configured"]) {
          expect(formatAuditMetadata(action, { reason, started: false })).toBe(
            "gerekçe: Çeviri sağlayıcısı yapılandırılmamış · başladı: hayır",
          );
        }
        for (const reason of ["already_running", "already running"]) {
          expect(formatAuditMetadata(action, { reason, started: false })).toBe(
            "gerekçe: Zaten çalışıyor · başladı: hayır",
          );
        }
      }
    });

    it("şikayet, bağlantı, görünürlük ve adres türü değerleri Türkçe", () => {
      expect(
        formatAuditMetadata("admin.complaint.resolved", { status: "DISMISSED", suspend: false }),
      ).toBe("durum: Reddedildi · askı: hayır");
      expect(
        formatAuditMetadata("company.connection.auto_created", {
          inviterCompanyId: "c1",
          origin: "INVITE",
          status: "PENDING",
        }),
      ).toBe("kaynak: Davet · durum: Bekliyor");
      expect(
        formatAuditMetadata("company.listing.published", {
          listingType: "ALIM",
          from: "DRAFT",
          to: "OPEN",
          visibility: "PUBLIC",
        }),
      ).toBe("ilan türü: Alım talebi · önce: Taslak · sonra: Açık · görünürlük: Herkese açık");
      const addr = formatAuditMetadata("company.address.created", {
        type: "TESLIMAT",
        title: "Depo",
        country: "TR",
        isDefault: false,
      });
      expect(addr).toBe("tür: Teslimat · başlık: Depo · ülke: Türkiye · varsayılan: hayır");
    });

    it("onay akışı tür ve durumu tek satırda tutarlı çevrilir (yarım çeviri yok)", () => {
      expect(
        formatAuditMetadata("company.approval_flow.status_changed", {
          from: "DRAFT",
          to: "ACTIVE",
          type: "LISTING_AWARD",
          listingType: "ALIM",
        }),
      ).toBe("önce: Taslak · sonra: Aktif · tür: Kazandırma onayı · ilan türü: Alım talebi");
      expect(
        formatAuditMetadata("company.approval_flow.deleted", {
          type: "LISTING_AWARD",
          statusBefore: "PASSIVE",
        }),
      ).toBe("tür: Kazandırma onayı · önceki durum: Pasif");
      expect(
        formatAuditMetadata("company.approval.approved", {
          type: "LISTING_PUBLISH",
          listingId: "l1",
          isFinal: true,
        }),
      ).toBe("tür: Talep yayını onayı · son adım: evet");
    });

    it("izin kodları her anahtarda etiketli; profil alanı Türkçe", () => {
      const s = formatAuditMetadata("company.user.permissions_changed", {
        before: ["buy:view", "templates:manage"],
        after: ["sell:bid:submit"],
        added: ["sell:bid:submit"],
        removed: ["buy:view", "templates:manage"],
        rolesBefore: ["YONETICI"],
        rolesAfter: ["SATISCI"],
      });
      expect(s).toBe(
        "önce: Satınalma görüntüleme, Şablonlar · sonra: Teklif verme · eklenen: Teklif verme · " +
          "çıkarılan: Satınalma görüntüleme, Şablonlar · önceki roller: Yönetici · yeni roller: Satışçı",
      );
      expect(s).not.toMatch(/[a-z]+:[a-z]+/);
      expect(
        formatAuditMetadata("company.listing.manage_denied", {
          needed: "buy:listing:manage",
          reason: "not_creator",
        }),
      ).toBe("gerekli yetki: Talep açma ve yönetme · gerekçe: Talebi açan kişi değil");
      expect(
        formatAuditMetadata("company.user.profile_updated", { changedFields: ["firstName", "lastName", "phone"] }),
      ).toBe("değişen alanlar: ad, soyad, telefon");
    });

    it("belge gönderimi: resetDocs ilk gönderimde de nötr etiketle", () => {
      const s = formatAuditMetadata("company.docs.submitted", {
        kycFields: ["mersisNo"],
        resetDocs: ["taxPlate", "tradeRegistry"],
      });
      expect(s).toBe(
        "doğrulama alanları: MERSİS no · incelemeye gönderilen belgeler: Vergi levhası, Ticaret sicil gazetesi",
      );
      expect(s).not.toMatch(/yeniden istenen/);
    });

    it("iç içe sayım nesneleri, e-posta şablonu, zaman tasarrufu ve tur aktarımı", () => {
      expect(
        formatAuditMetadata("admin.company.exported", {
          rothernId: "76VR-K0A5",
          rowCounts: { users: 2, listings: 0, adminNotes: 1, ordersAsBuyer: 0 },
        }),
      ).toBe(
        "Rothern kodu: 76VR-K0A5 · kayıt sayıları: (kullanıcı: 2 · ilan: 0 · admin notu: 1 · alım siparişi: 0)",
      );
      expect(
        formatAuditMetadata("admin.company.anonymized", {
          retainedBecause: { membershipEvents: 1, complaintsReceived: 2 },
        }),
      ).toBe("saklama nedeni: (üyelik kaydı: 1 · hakkındaki şikayet: 2)");
      expect(formatAuditMetadata("email.resent", { template: "suppression_clear", sent: false })).toBe(
        "şablon: Engel kaldırma (iç kayıt) · gönderilen: hayır",
      );
      expect(
        formatAuditMetadata("admin.system.time_savings_config_updated", {
          poPrepMin: 10,
          approvalLoopMin: 20,
          hourlyLaborCost: null,
        }),
      ).toBe("PO hazırlama (dk): 10 · onay döngüsü (dk): 20");
      expect(
        formatAuditMetadata("company.listing.next_round_created", { carryBids: "NONE" }),
      ).toBe("teklif aktarımı: Aktarılmaz");
      expect(
        formatAuditMetadata("company.user.roles_changed", { droppedGroups: ["buy", "sell"] }),
      ).toBe("kapanan alanlar: satınalma, satış");
    });

    it("profil tanıtımı önerisi satırı Türkçe: 'chars' ham anahtar olarak basılmaz", () => {
      // Başarı izi `{ products, chars }` yazar; `chars` etiketsizken Detay
      // hücresi "ürün: 3 · chars: 412" basıyordu (Türkçe etiketin yanında ham anahtar).
      expect(formatAuditMetadata("company.profile_enriched", { products: 3, chars: 412 })).toBe(
        "ürün: 3 · karakter: 412",
      );
      expect(formatAuditMetadata("company.profile_enrich_attempt", { products: 0 })).toBe("ürün: 0");
    });

    it("profil tanıtımı servisinin yazdığı HER metadata anahtarı etiketli (API kaynağı taranır)", () => {
      const src = readFileSync(
        path.resolve(
          __dirname,
          "../../../../../apps/api/src/modules/ai/profile-enrich/profile-enrich.service.ts",
        ),
        "utf8",
      );
      const keys = new Set<string>();
      for (const m of src.matchAll(/\bmetadata:\s*\{([^{}]*)\}/g)) {
        for (const part of m[1]!.split(",")) {
          const key = part.trim().match(/^([A-Za-z_]\w*)/)?.[1];
          if (key) keys.add(key);
        }
      }
      // Tarama gerçekten bir şey buluyor (servis taşınırsa/yeniden yazılırsa sessizce boş geçmesin).
      expect([...keys].sort()).toEqual(expect.arrayContaining(["chars", "products"]));
      const raw = [...keys].filter((k) => formatAuditMetadata("company.profile_enriched", { [k]: 1 }).startsWith(`${k}:`));
      expect(raw).toEqual([]);
    });

    it("izin etiket aynası @rothern/shared kataloğuyla birebir", () => {
      const src = readFileSync(
        path.resolve(__dirname, "../../../../../packages/shared/src/constants/company-permissions.ts"),
        "utf8",
      );
      const catalog = src.slice(
        src.indexOf("COMPANY_PERMISSION_CATALOG"),
        src.indexOf("] as const;", src.indexOf("COMPANY_PERMISSION_CATALOG")),
      );
      const pairs = [...catalog.matchAll(/key:\s*"([a-z:]+)",\s*label:\s*"([^"]+)"/g)].map((m) => [
        m[1],
        m[2],
      ]);
      expect(pairs.length).toBeGreaterThanOrEqual(15);
      for (const [k, label] of pairs) expect(COMPANY_PERMISSION_LABEL[k]).toBe(label);
      const ownerOnly = src.slice(src.indexOf("OWNER_ONLY_PERMISSIONS"));
      for (const m of ownerOnly.slice(0, ownerOnly.indexOf("] as const")).matchAll(/"([a-z:]+)"/g)) {
        expect(COMPANY_PERMISSION_LABEL).toHaveProperty([m[1]]);
      }
      expect(Object.keys(COMPANY_PERMISSION_LABEL)).toHaveLength(pairs.length + 3);
    });
  });
});
