import { formatVerificationReason, parseVerificationReason } from "@rothern/shared";
import { AdminCompaniesService } from "../../src/modules/admin-companies/admin-companies.service";

/**
 * Admin KYC incelemesi — uluslararası denetim (2026-09-27):
 *  · Red gerekçesi KODLU saklanır ("[KOD] not"); firma kodu kendi dilinde okur.
 *  · Kayda kapalı ülkeye (ABD, yaptırım ülkeleri) admin yolundan taşınamaz.
 *  · Hukuki yapı admin'den düzeltilir; "Diğer" iken yerel ad zorunlu.
 */

const BEFORE = {
  name: "Acme", legalName: null, taxNumber: null, taxOffice: null, mersisNo: null,
  tradeRegistryNo: null, country: "TR", companyType: "LIMITED", legalFormLocal: null,
  stateRegion: null, city: null, addressLine: null, billingEmail: null, website: null,
  industry: null, iban: null, ibanHolder: null, bankSwiftBic: null, bankName: null,
};

function rig(company: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const row = { ...BEFORE, ...company };
  const prisma = {
    company: {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    ...extra,
  };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new AdminCompaniesService(
    prisma as never, {} as never, {} as never, {} as never, {} as never, audit as never, {} as never,
  );
  jest.spyOn(svc, "notifyCompany").mockResolvedValue(undefined as never);
  return { svc, prisma };
}

describe("kodlu red gerekçesi — shared biçim", () => {
  it("kod + not gidiş-dönüş; kodsuz eski metin nota düşer; eski şablon koda eşlenir", () => {
    expect(formatVerificationReason("UNREADABLE", "  blurry  ")).toBe("[UNREADABLE] blurry");
    expect(formatVerificationReason("OUTDATED")).toBe("[OUTDATED]");
    expect(formatVerificationReason(null, "serbest")).toBe("serbest");
    expect(formatVerificationReason(null, " ")).toBeNull();
    expect(parseVerificationReason("[MISMATCH] Unvan farklı")).toEqual({ code: "MISMATCH", note: "Unvan farklı" });
    expect(parseVerificationReason("[FOO] x")).toEqual({ code: null, note: "[FOO] x" });
    expect(parseVerificationReason("Belge okunmuyor / bulanık")).toEqual({ code: "UNREADABLE", note: null });
    expect(parseVerificationReason(
      "Ülke değişikliği sonrası yeni zorunlu belgeler eksik — lütfen tamamlayıp yeniden gönderin.",
    )).toEqual({ code: "COUNTRY_CHANGED", note: null });
  });
});

describe("setVerification (firma reddi) — kod VEYA ≥3 karakterlik not", () => {
  const DOCS = {
    docTaxPlateUrl: "k/tax", docTradeRegistryUrl: "k/trade", docIdFrontUrl: "k/idf",
    companyVerificationStatus: "PENDING", country: "DE",
  };

  it("yalnız kodla red → '[KOD]' saklanır (firma gerekçesi + zorunlu belgeler)", async () => {
    const { svc, prisma } = rig(DOCS);
    await svc.setVerification("c1", "REJECTED", "a1", undefined, "UNREADABLE");
    const data = (prisma.company.updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.companyRejectionReason).toBe("[UNREADABLE]");
    expect(data.docTaxPlateReason).toBe("[UNREADABLE]");
  });

  it("kod + not → '[KOD] not'; yalnız not (≥3) → not aynen", async () => {
    const a = rig(DOCS);
    await a.svc.setVerification("c1", "REJECTED", "a1", "Adres farklı", "MISMATCH");
    expect((a.prisma.company.updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data.companyRejectionReason)
      .toBe("[MISMATCH] Adres farklı");
    const b = rig(DOCS);
    await b.svc.setVerification("c1", "REJECTED", "a1", "okunmuyor");
    expect((b.prisma.company.updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data.companyRejectionReason)
      .toBe("okunmuyor");
  });

  it("gerekçesiz / kısa notlu / bilinmeyen kodlu red reddedilir, yazılmaz", async () => {
    const { svc, prisma } = rig(DOCS);
    await expect(svc.setVerification("c1", "REJECTED", "a1")).rejects.toThrow();
    await expect(svc.setVerification("c1", "REJECTED", "a1", "ab")).rejects.toThrow();
    await expect(svc.setVerification("c1", "REJECTED", "a1", "okunmuyor", "FOO" as never)).rejects.toThrow();
    expect(prisma.company.updateMany).not.toHaveBeenCalled();
  });
});

describe("reviewDocuments — belge bazlı kodlu gerekçe", () => {
  const CO = {
    country: "DE", companyVerificationStatus: "PENDING",
    docTaxPlateUrl: "k/tax", docTradeRegistryUrl: "k/trade", docIdFrontUrl: "k/idf",
  };

  it("reasonCode + not saklanır; bilinmeyen kod 400", async () => {
    const { svc, prisma } = rig(CO);
    await svc.reviewDocuments(
      "c1",
      {
        taxPlate: { status: "REJECTED", reasonCode: "OUTDATED", reason: "2023" },
        tradeRegistry: { status: "APPROVED" },
        idFront: { status: "REJECTED", reasonCode: "UNREADABLE" },
      },
      "a1",
    );
    const data = (prisma.company.updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.docTaxPlateReason).toBe("[OUTDATED] 2023");
    expect(data.docIdFrontReason).toBe("[UNREADABLE]");
    expect(data.docTradeRegistryReason).toBeNull();

    const bad = rig(CO);
    await expect(
      bad.svc.reviewDocuments(
        "c1",
        {
          taxPlate: { status: "REJECTED", reasonCode: "NOPE" as never, reason: "yeterli not" },
          tradeRegistry: { status: "APPROVED" },
          idFront: { status: "APPROVED" },
        },
        "a1",
      ),
    ).rejects.toThrow();
    expect(bad.prisma.company.updateMany).not.toHaveBeenCalled();
  });
});

describe("reviewDocRevision — kodlu gerekçe revizyona yazılır", () => {
  it("yalnız kodla ret kabul; gerekçesiz ret reddedilir", async () => {
    const tx = {
      companyKycRevision: { updateMany: jest.fn(async () => ({ count: 1 })) },
      company: { findUnique: jest.fn(), update: jest.fn() },
    };
    const { svc } = rig({}, {
      companyKycRevision: {
        findUnique: jest.fn(async () => ({ id: "r1", companyId: "c1", status: "PENDING", kind: "taxPlate", key: "k/new" })),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    });
    await svc.reviewDocRevision("c1", "r1", { status: "REJECTED", reasonCode: "WRONG_DOCUMENT" }, "a1");
    expect(tx.companyKycRevision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: "[WRONG_DOCUMENT]" }) }),
    );
    await expect(svc.reviewDocRevision("c1", "r1", { status: "REJECTED" }, "a1")).rejects.toThrow();
  });
});

describe("admin firma düzeltme — kayda kapalı ülke + hukuki yapı", () => {
  it("ABD ve yaptırım ülkesine taşıma reddedilir; ülke değişmiyorsa diğer alan düzenlenebilir", async () => {
    const { svc, prisma } = rig();
    await expect(svc.updateProfile("c1", { country: "US" }, "a1")).rejects.toThrow();
    await expect(svc.updateProfile("c1", { country: "ir" }, "a1")).rejects.toThrow();
    expect(prisma.company.update).not.toHaveBeenCalled();

    // Eski (kapı öncesi) ABD kaydı: ülke aynı kalırken ad düzeltilebilir.
    const legacy = rig({ country: "US" });
    await expect(legacy.svc.updateProfile("c1", { country: "US", name: "Acme Inc" }, "a1"))
      .resolves.toMatchObject({ ok: true, changed: ["name"] });
  });

  it("'Diğer' seçilince yerel ad zorunlu; verilince ikisi yazılır", async () => {
    const { svc, prisma } = rig({ country: "DE" });
    await expect(svc.updateProfile("c1", { companyType: "OTHER" }, "a1")).rejects.toThrow();
    expect(prisma.company.update).not.toHaveBeenCalled();
    // Ülkenin listesinde OLMAYAN ad serbest metindir: istenen tür ("Diğer") saklanır.
    await svc.updateProfile("c1", { companyType: "OTHER", legalFormLocal: " Stiftung " }, "a1");
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyType: "OTHER", legalFormLocal: "Stiftung" } }),
    );
  });

  // İnceleme 2026-10-08 (admin-type-correction-erases-local-name). Bu sürümden
  // önce kaydolan her yabancı firma "Diğer + yerel ad" (OTHER + GmbH) olarak
  // saklı. Admin türü düzeltirken adı AYNEN gönderdiğinde ad, "değişmeyeni
  // atla" kuralıyla istekten düşüyor, "ad verilmedi" sayılıp SİLİNİYORDU —
  // admin kutuda GmbH'yı ve başarı bildirimini görüyor, firma "Limited Şirket"
  // olarak (adsız) kalıyordu.
  it("tür düzeltilirken kayıtlı yerel ad AYNEN gönderilirse ad korunur (Diğer + GmbH → Limited + GmbH)", async () => {
    const a = rig({ country: "DE", companyType: "OTHER", legalFormLocal: "GmbH" });
    await expect(a.svc.updateProfile("c1", { companyType: "LIMITED", legalFormLocal: "GmbH" }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["companyType"] });
    expect(a.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyType: "LIMITED" } }),
    );
    // Listesi olmayan ülkede de (eşleme yok): ad istekte olduğu sürece silinmez.
    const b = rig({ country: "KE", companyType: "OTHER", legalFormLocal: "Ltd" });
    await expect(b.svc.updateProfile("c1", { companyType: "LIMITED", legalFormLocal: " Ltd " }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["companyType"] });
    expect(b.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyType: "LIMITED" } }),
    );
    // Eski admin paketi adı hiç göndermez: kayıtlı ad listede zaten YENİ türün
    // adıysa kalır (GmbH = DE'de Limited), değilse eskisi gibi silinir.
    const c = rig({ country: "DE", companyType: "OTHER", legalFormLocal: "GmbH" });
    await expect(c.svc.updateProfile("c1", { companyType: "LIMITED" }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["companyType"] });
    expect(c.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyType: "LIMITED" } }),
    );
  });

  // EŞLEMENİN SAHİBİ API (2026-10-08): yerel ad firmanın ülkesinin listesindeyse
  // saklanan tür listeden gelir, istek hangi türü taşırsa taşısın (`@rothern/
  // shared` `resolveLegalForm`, onboarding ile aynı). Listede olmayan ad isteğin
  // türünü korur.
  it("yerel ad ülkenin listesindeyse tür LİSTEDEN yazılır; yanıt ezilen türü `mappedCompanyType` ile söyler", async () => {
    // Admin "Diğer" seçip "GmbH" yazdı: GmbH, DE'de Limited → Limited kalır, yalnız ad yazılır.
    const a = rig({ country: "DE" });
    await expect(a.svc.updateProfile("c1", { companyType: "OTHER", legalFormLocal: " GmbH " }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["legalFormLocal"], mappedCompanyType: "LIMITED" });
    expect(a.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { legalFormLocal: "GmbH" } }),
    );
    // Yanlış tür + listedeki ad: "Anonim" + GmbH gönderildi, Limited saklanır.
    const b = rig({ country: "DE", companyType: "OTHER", legalFormLocal: "GmbH" });
    await expect(b.svc.updateProfile("c1", { companyType: "JOINT_STOCK", legalFormLocal: "GmbH" }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["companyType"], mappedCompanyType: "LIMITED" });
    expect(b.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyType: "LIMITED" } }),
    );
    // Sonuç kayıtlı hâlle aynı: hiçbir şey yazılmaz, ama yanıt nedenini söyler.
    const c = rig({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" });
    await expect(c.svc.updateProfile("c1", { companyType: "JOINT_STOCK", legalFormLocal: "GmbH" }, "a1"))
      .resolves.toEqual({ ok: true, changed: [], mappedCompanyType: "LIMITED" });
    expect(c.prisma.company.update).not.toHaveBeenCalled();
    // Yalnız ad değişir (tür gönderilmez): tür yeni adın türüne çekilir.
    const d = rig({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" });
    await expect(d.svc.updateProfile("c1", { legalFormLocal: "e.K." }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["legalFormLocal", "companyType"], mappedCompanyType: "SOLE_PROPRIETOR" });
    expect(d.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { legalFormLocal: "e.K.", companyType: "SOLE_PROPRIETOR" } }),
    );
    // Kişisel vergi numarası: Rus "ИП" hangi türle gelirse gelsin şahıs işletmesidir.
    const e = rig({ country: "RU", companyType: "OTHER", legalFormLocal: "Самозанятый" });
    await e.svc.updateProfile("c1", { companyType: "OTHER", legalFormLocal: "ИП" }, "a1");
    expect(e.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { legalFormLocal: "ИП", companyType: "SOLE_PROPRIETOR" } }),
    );
    // Eşleme istekle DEĞİŞEN ülkeye göredir: DE → KE (listesiz) + "GmbH" serbest metindir.
    const f = rig({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" });
    await expect(f.svc.updateProfile("c1", { country: "KE", companyType: "OTHER", legalFormLocal: "GmbH" }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["country", "companyType"] });
    // Türkiye'de liste yok: genel tür olduğu gibi yazılır, yanıt bayrak taşımaz.
    const g = rig();
    await expect(g.svc.updateProfile("c1", { companyType: "SOLE_PROPRIETOR" }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["companyType"] });
    // Hukuki yapıya dokunmayan istek eski kaydı yeniden eşlemez.
    const h = rig({ country: "DE", companyType: "OTHER", legalFormLocal: "GmbH" });
    await expect(h.svc.updateProfile("c1", { name: "Acme GmbH" }, "a1"))
      .resolves.toEqual({ ok: true, changed: ["name"] });
    expect(h.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Acme GmbH" } }),
    );
  });

  // 2026-10-08: yerel ad HER türle saklanır (kayıt sihirbazı ülkenin yerel
  // yapılarını listeler: LIMITED + "GmbH"). Eskiden "Diğer" dışındaki türde
  // gelen yerel ad atılıyor, türü değişmeyen firmanın adı düzeltilemiyordu.
  it("yerel ad her türle yazılır; tür değişip yeni ad verilmezse eski ad silinir", async () => {
    // Tür aynı kalırken yalnız yerel ad düzeltilir.
    const a = rig({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" });
    await expect(a.svc.updateProfile("c1", { legalFormLocal: " UG (haftungsbeschränkt) " }, "a1"))
      .resolves.toMatchObject({ changed: ["legalFormLocal"] });
    expect(a.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { legalFormLocal: "UG (haftungsbeschränkt)" } }),
    );
    // Yerel adı olmayan firmaya, türü "Diğer" değilken yerel ad eklenir.
    const b = rig({ country: "DE" });
    await expect(b.svc.updateProfile("c1", { legalFormLocal: "GmbH" }, "a1"))
      .resolves.toMatchObject({ changed: ["legalFormLocal"] });
    expect(b.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { legalFormLocal: "GmbH" } }),
    );
    // Tür değişir, yerel ad verilmez → eski ad o türe aitti, silinir (kayıtta görünür).
    for (const before of ["OTHER", "LIMITED"]) {
      const c = rig({ country: "DE", companyType: before, legalFormLocal: "GmbH" });
      await expect(c.svc.updateProfile("c1", { companyType: "JOINT_STOCK" }, "a1"))
        .resolves.toMatchObject({ changed: ["companyType", "legalFormLocal"] });
      expect(c.prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { companyType: "JOINT_STOCK", legalFormLocal: null } }),
      );
    }
    // Tür ve yeni yerel ad birlikte → ikisi de yazılır.
    const d = rig({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" });
    await d.svc.updateProfile("c1", { companyType: "JOINT_STOCK", legalFormLocal: "AG" }, "a1");
    expect(d.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyType: "JOINT_STOCK", legalFormLocal: "AG" } }),
    );
    // "Diğer"e geçiş: eski yerel ad serbest metin olarak geçerli kalır (ad
    // ülkenin listesinde değilse — listedeki ad türünü kendisi belirler).
    const e = rig({ country: "DE", companyType: "LIMITED", legalFormLocal: "Stiftung" });
    await expect(e.svc.updateProfile("c1", { companyType: "OTHER" }, "a1"))
      .resolves.toMatchObject({ changed: ["companyType"] });
    expect(e.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyType: "OTHER" } }),
    );
    // Yerel ad boşaltılır (tür "Diğer" değil) → silinir; "Diğer"de boşaltılamaz.
    const f = rig({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" });
    await f.svc.updateProfile("c1", { legalFormLocal: "" }, "a1");
    expect(f.prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { legalFormLocal: null } }),
    );
    const g = rig({ country: "DE", companyType: "OTHER", legalFormLocal: "Stiftung" });
    await expect(g.svc.updateProfile("c1", { legalFormLocal: "" }, "a1")).rejects.toThrow();
    expect(g.prisma.company.update).not.toHaveBeenCalled();
    // Eski, adsız bir "Diğer" kaydında hukuki yapıya dokunmayan düzeltme reddedilmez.
    const h = rig({ country: "DE", companyType: "OTHER", legalFormLocal: null });
    await expect(h.svc.updateProfile("c1", { companyType: "OTHER", name: "Acme e.V." }, "a1"))
      .resolves.toMatchObject({ changed: ["name"] });
  });

  it("ülke değişince eksik belge → gerekçe KODLU (COUNTRY_CHANGED), Türkçe cümle değil", async () => {
    const { svc, prisma } = rig({ country: "DE", companyVerificationStatus: "VERIFIED" });
    await svc.updateProfile("c1", { country: "AT" }, "a1");
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyRejectionReason: "[COUNTRY_CHANGED]" }),
      }),
    );
  });
});
