import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { AiBudgetExceededException } from "../../src/modules/ai/ai-budget.service";
import { ProfileEnrichService } from "../../src/modules/ai/profile-enrich/profile-enrich.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";

/**
 * PROFİL ZENGİNLEŞTİRME — PAKET KAPISI SÖZLEŞMESİ.
 *
 * Kullanıcı kararı 2026-09-14: ücretsiz pakete de AÇIK ama **firma başına bir
 * kez**. Gerekçe: dolu bir profil platformun işine yarıyor (indekslenen sayfa
 * = organik büyüme) ve tek çağrılık maliyet bilinen en ucuz müşteri edinme.
 * Tekrarlayan bir özellik DEĞİL, bir kerelik kurulum adımı — o yüzden aylık
 * bütçeye değil ÖMÜRLÜK sayaca bağlı.
 *
 * Bu dosya para harcayan bir kapıyı tutuyor: sayaç bozulursa ücretsiz firma
 * sınırsız AI çağırır ve maliyeti biz öderiz.
 */
function rig(tier: string, oncekiBasari: number) {
  // Firma kilidi alınan tx: ömürlük hak (BAŞARILI dönüş = `company.profile_enriched`)
  // ve günlük deneme sayacı BURADA. Kapının geçildiğini deneme kaydının
  // yazılmaya çalışılmasından görüyoruz — sınanan şey kapı, sayaç değil.
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    auditLog: {
      count: jest.fn(async (args: { where: { action: string } }) =>
        args.where.action === "company.profile_enriched" ? oncekiBasari : 0,
      ),
      create: jest.fn().mockRejectedValue(new Error("buraya kadar")),
    },
  };
  const prisma = {
    // Eski sayaç: `aiUsage` durum filtresiz sayılıyordu — FAILED satır da
    // hakkı yakıyordu (derin denetim S014). Artık HİÇ okunmamalı.
    aiUsage: { count: jest.fn().mockResolvedValue(99) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    company: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: "Acme", website: "acme.com", city: "İzmir" }),
    },
  };
  const ai = { callAi: jest.fn() };
  // ⚠️ CONSTRUCTOR SIRASI: (config, provider, prisma, audit, ai). Sıra kayarsa
  // yanlış nesne enjekte olur ve hata yalnız o bağımlılığa ULAŞAN testte çıkar
  // (bu kod tabanında sekiz kez tekrarlanan tuzak).
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new ProfileEnrichService(
    { enabled: true } as never,
    {} as never, // provider — yoksa servis 503 atar
    prisma as never,
    audit as never,
    ai as never,
  );
  const user = {
    companyId: "c1",
    userId: "u1",
    tier,
  } as unknown as AuthenticatedCompanyUser;
  return { svc, prisma, tx, ai, audit, user };
}

const BASARILI_SAYIM = {
  where: { tenantId: "c1", action: "company.profile_enriched" },
};

describe("ProfileEnrichService — paket kapısı", () => {
  it("ÜCRETSİZ firma hiç BAŞARILI taslak almamışsa GEÇER — sayım firma kilidinin içinde", async () => {
    const r = rig("STANDART", 0);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow("buraya kadar");
    expect(r.tx.auditLog.count).toHaveBeenCalledWith(BASARILI_SAYIM);
    // Kilit sayımdan ÖNCE alınır (eşzamanlı istekler aynı sayacı görmesin).
    expect(r.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      r.tx.auditLog.count.mock.invocationCallOrder[0]!,
    );
  });

  it("başarısız AI denemeleri (FAILED/boş taslak) tek hakkı YAKMAZ — aiUsage sayılmaz (derin denetim S014)", async () => {
    const r = rig("STANDART", 0);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow("buraya kadar");
    expect(r.prisma.aiUsage.count).not.toHaveBeenCalled();
  });

  it("ÜCRETSİZ firma bir kez BAŞARILI taslak almışsa REDDEDİLİR — AI çağrısı ve deneme kaydı HİÇ yok", async () => {
    const r = rig("STANDART", 1);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow(ForbiddenException);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow(/bir kez/);
    // Para harcayan adıma HİÇ gidilmemeli; günlük deneme hakkı da yanmamalı.
    expect(r.ai.callAi).not.toHaveBeenCalled();
    expect(r.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("SILVER sayaçtan MUAF — ömürlük sınır yalnız ücretsize", async () => {
    const r = rig("SILVER", 99);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow("buraya kadar");
    expect(r.tx.auditLog.count).not.toHaveBeenCalledWith(BASARILI_SAYIM);
  });

  it("GOLD de muaf", async () => {
    const r = rig("GOLD", 99);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow("buraya kadar");
    expect(r.tx.auditLog.count).not.toHaveBeenCalledWith(BASARILI_SAYIM);
  });

  it("web sitesi yoksa AI çağrılmaz — boş çağrıya para ödenmez", async () => {
    const r = rig("STANDART", 0);
    r.prisma.company.findUnique.mockResolvedValue({
      name: "Acme",
      website: null,
      city: "İzmir",
    });
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow(/web siteniz/i);
    expect(r.ai.callAi).not.toHaveBeenCalled();
  });
});

describe("ProfileEnrichService — AI çağrısı ve başarı izi", () => {
  function akis(tier = "STANDART") {
    const r = rig(tier, 0);
    r.tx.auditLog.create.mockResolvedValue({});
    // Site okunamadı → grounded yol (JS ile çizilen site / bot engeli).
    jest.spyOn(r.svc as never, "fetchSite" as never).mockResolvedValue(null as never);
    return r;
  }

  it("bütçe reddi 'birkaç dakika sonra deneyin' 503'üne ÇEVRİLMEZ — olduğu gibi iletilir (derin denetim X21)", async () => {
    const r = akis();
    const red = new AiBudgetExceededException("budget");
    r.ai.callAi.mockRejectedValue(red);
    await expect(r.svc.enrich(r.user, {})).rejects.toBe(red);
    expect(r.audit.log).not.toHaveBeenCalled();
  });

  it("beklenmeyen (HTTP olmayan) hata hâlâ 503", async () => {
    const r = akis();
    r.ai.callAi.mockRejectedValue(new Error("boom"));
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow(ServiceUnavailableException);
    expect(r.audit.log).not.toHaveBeenCalled();
  });

  it("boş taslak hakkı yakmaz: başarı izi YAZILMAZ", async () => {
    const r = akis();
    r.ai.callAi
      .mockResolvedValueOnce({ text: "serbest metin" })
      .mockResolvedValueOnce({ text: JSON.stringify({ aboutText: "", services: [] }) });
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow();
    expect(r.audit.log).not.toHaveBeenCalled();
  });

  it("başarılı taslakta ömürlük hakkın izi (company.profile_enriched) AWAIT'li ve kritik yazılır", async () => {
    const r = akis();
    let yazildi = false;
    r.audit.log.mockImplementation(async () => {
      await Promise.resolve();
      yazildi = true;
    });
    r.ai.callAi
      .mockResolvedValueOnce({ text: "serbest metin" })
      .mockResolvedValueOnce({
        text: JSON.stringify({ aboutText: "Acme endustriyel vana uretir.", services: ["Vana"] }),
      });
    const draft = await r.svc.enrich(r.user, {});
    expect(draft.aboutText).toContain("Acme");
    expect(yazildi).toBe(true);
    expect(r.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.profile_enriched",
        tenantId: "c1",
        critical: true,
      }),
    );
  });
});
