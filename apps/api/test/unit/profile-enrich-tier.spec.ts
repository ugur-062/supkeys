import { ForbiddenException } from "@nestjs/common";
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
function rig(tier: string, oncekiKullanim: number) {
  const prisma = {
    aiUsage: { count: jest.fn().mockResolvedValue(oncekiKullanim) },
    // Paket kapısından SONRA günlük deneme sayacı geliyor ve o bir tx açıyor.
    // Kapının geçildiğini bu işaretle görüyoruz — sınanan şey kapı, sayaç değil.
    $transaction: jest.fn().mockRejectedValue(new Error("buraya kadar")),
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
  return { svc, prisma, ai, user };
}

describe("ProfileEnrichService — paket kapısı", () => {
  it("ÜCRETSİZ firma hiç kullanmamışsa GEÇER — sayaç okunur", async () => {
    const r = rig("STANDART", 0);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow("buraya kadar");
    expect(r.prisma.aiUsage.count).toHaveBeenCalledWith({
      where: { companyId: "c1", feature: "profile_enrich" },
    });
  });

  it("ÜCRETSİZ firma bir kez kullanmışsa REDDEDİLİR — AI çağrısı HİÇ yapılmaz", async () => {
    const r = rig("STANDART", 1);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow(ForbiddenException);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow(/bir kez/);
    // Para harcayan adıma HİÇ gidilmemeli.
    expect(r.ai.callAi).not.toHaveBeenCalled();
  });

  it("SILVER sayaçtan MUAF — ömürlük sınır yalnız ücretsize", async () => {
    const r = rig("SILVER", 99);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow("buraya kadar");
    expect(r.prisma.aiUsage.count).not.toHaveBeenCalled();
  });

  it("GOLD de muaf", async () => {
    const r = rig("GOLD", 99);
    await expect(r.svc.enrich(r.user, {})).rejects.toThrow("buraya kadar");
    expect(r.prisma.aiUsage.count).not.toHaveBeenCalled();
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
