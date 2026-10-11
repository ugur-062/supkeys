import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AiBudgetExceededException } from "../../src/modules/ai/ai-budget.service";
import {
  LIMITED_PAID_CALL_LIMIT,
  LIMITED_SUGGESTION_LIMIT,
  ProfileEnrichService,
  profileEnrichDayStart,
  remainingAfterSuccess,
} from "../../src/modules/ai/profile-enrich/profile-enrich.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";

/**
 * PROFİL TANITIMI ÖNERİSİ — ADET / PAKET KAPISI SÖZLEŞMESİ.
 *
 * Sahip kararı 2026-10-08: özellik web'e çıkmaz, yalnız tanıtım metnini yazar.
 * "Firma başına bir kez" kuralı her çalıştırma dış site çekip web araması
 * yaptığı içindi; artık:
 *  · günlük DENEME sınırı (3) herkes için durur,
 *  · tam erişimi OLMAYAN firma ömür boyu en fazla 6 BAŞARILI öneri alır,
 *  · tam erişimli firma yalnız günlük sınır ve AI bütçesiyle sınırlıdır,
 *  · başarısız deneme hak yakmaz; audit izleri (deneme / bitiş / başarı) durur.
 *
 * Bu dosya para harcayan bir kapıyı tutuyor: sayaç bozulursa tam erişimi
 * olmayan firma sınırsız AI çağırır ve maliyeti biz öderiz.
 */
function rig(
  tier: string,
  o: { succeeded?: number; paidCalls?: number; inFlight?: number; attemptsToday?: number } = {},
) {
  const succeeded = o.succeeded ?? 0;
  // Firma kilidi alınan tx: ömürlük hak (BAŞARILI dönüş = `company.profile_enriched`)
  // ve günlük deneme sayacı BURADA.
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    auditLog: {
      count: jest.fn(async (args: { where: { action: string } }) =>
        args.where.action === "company.profile_enriched"
          ? succeeded
          : args.where.action === "company.profile_enrich_attempt"
            ? (o.attemptsToday ?? 0)
            : 0,
      ),
      // Pencere içindeki denemeler; bitiş kaydı (settled) sayımı 0 → hepsi sürüyor (X23).
      findMany: jest.fn(async () =>
        Array.from({ length: o.inFlight ?? 0 }, (_, i) => ({ id: `d${i}` })),
      ),
      create: jest.fn().mockResolvedValue({ id: "att1" }),
    },
    // Ömürlük ÜCRETLİ çağrı tavanı (MU-06 gözden geçirme): costUsd > 0 satırlar.
    aiUsage: { count: jest.fn().mockResolvedValue(o.paidCalls ?? 0) },
  };
  const prisma = {
    // Eski sayaç: `aiUsage` durum filtresiz ve kilit DIŞINDA sayılıyordu —
    // FAILED satır da hakkı yakıyordu (derin denetim S014). Kilit dışından
    // HİÇ okunmamalı.
    aiUsage: { count: jest.fn().mockResolvedValue(99) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    company: {
      findUnique: jest.fn().mockResolvedValue({
        name: "Acme Vana",
        companyType: "LIMITED",
        legalFormLocal: null,
        country: "TR",
        city: "İzmir",
        industry: "Endüstriyel vana",
        services: [],
        activities: [],
        sellerCategoryIds: [],
        sellerSubCategoryIds: [],
        buyerCategoryIds: [],
        buyerSubCategoryIds: [],
      }),
    },
    companyItem: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const ai = {
    isEnabled: true,
    callAi: jest.fn().mockResolvedValue({
      text: JSON.stringify({ aboutText: "Acme Vana olarak İzmir'de endüstriyel vana üretiyoruz." }),
    }),
  };
  // ⚠️ CONSTRUCTOR SIRASI: (prisma, audit, ai). Sıra kayarsa yanlış nesne
  // enjekte olur ve hata yalnız o bağımlılığa ULAŞAN testte çıkar.
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new ProfileEnrichService(prisma as never, audit as never, ai as never);
  const user = {
    companyId: "c1",
    userId: "u1",
    email: "u1@test.local",
    tier,
    companyVerificationStatus: "UNVERIFIED",
  } as unknown as AuthenticatedCompanyUser;
  return { svc, prisma, tx, ai, audit, user };
}

/** Ömürlük hakkı yakan başarı izi (bitiş kaydı `company.profile_enrich_settled` ayrı). */
const BASARI_IZI = expect.objectContaining({ action: "company.profile_enriched" });
const BASARILI_SAYIM = { where: { tenantId: "c1", action: "company.profile_enriched" } };
const actions = (log: jest.Mock) => log.mock.calls.map((c) => (c[0] as { action: string }).action);

describe("ProfileEnrichService — tam erişimi olmayan firma: ömürlük 6 başarılı öneri", () => {
  it("sınır 6 (eski 'firma başına bir kez' kuralı kalktı)", () => {
    expect(LIMITED_SUGGESTION_LIMIT).toBe(6);
  });

  it("hiç öneri almamış firma GEÇER — sayım firma kilidinin içinde, kilit sayımdan önce", async () => {
    const r = rig("STANDART");
    const draft = await r.svc.enrich(r.user);
    expect(draft.remainingSuggestions).toBe(5);
    expect(r.tx.auditLog.count).toHaveBeenCalledWith(BASARILI_SAYIM);
    expect(r.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      r.tx.auditLog.count.mock.invocationCallOrder[0]!,
    );
  });

  it("bir kez almış firma ARTIK reddedilmez; 5 başarıdan sonra son hak kalır (kalan 0)", async () => {
    const bir = rig("STANDART", { succeeded: 1 });
    await expect(bir.svc.enrich(bir.user)).resolves.toMatchObject({ remainingSuggestions: 4 });
    const bes = rig("STANDART", { succeeded: 5 });
    await expect(bes.svc.enrich(bes.user)).resolves.toMatchObject({ remainingSuggestions: 0 });
  });

  it("6 başarılı öneriden sonra REDDEDİLİR — AI çağrısı ve deneme kaydı HİÇ yok, metin doğrulamayı söyler", async () => {
    const r = rig("STANDART", { succeeded: 6 });
    await expect(r.svc.enrich(r.user)).rejects.toThrow(ForbiddenException);
    await expect(r.svc.enrich(r.user)).rejects.toThrow(/toplam 6 AI tanıtım önerisi/);
    // Para harcayan adıma HİÇ gidilmemeli; günlük deneme hakkı da yanmamalı.
    expect(r.ai.callAi).not.toHaveBeenCalled();
    expect(r.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("başarısız AI denemeleri hakkı YAKMAZ — yalnız başarı izi sayılır, kilit dışından aiUsage okunmaz (S014)", async () => {
    const r = rig("STANDART");
    await r.svc.enrich(r.user);
    expect(r.prisma.aiUsage.count).not.toHaveBeenCalled();
    expect(r.tx.auditLog.count).toHaveBeenCalledWith(BASARILI_SAYIM);
  });

  it("taslak dönmeyen ÜCRETLİ denemelerin ömürlük tavanı var: tavanda REDDEDİLİR, altında GEÇER (MU-06)", async () => {
    expect(LIMITED_PAID_CALL_LIMIT).toBeGreaterThan(LIMITED_SUGGESTION_LIMIT);
    const dolu = rig("STANDART", { paidCalls: LIMITED_PAID_CALL_LIMIT });
    await expect(dolu.svc.enrich(dolu.user)).rejects.toThrow(ForbiddenException);
    // Yalnız para harcamış satırlar sayılır; sağlayıcı hatası (costUsd=0) yakmaz.
    expect(dolu.tx.aiUsage.count).toHaveBeenCalledWith({
      where: { companyId: "c1", feature: "profile_enrich", costUsd: { gt: 0 } },
    });
    expect(dolu.ai.callAi).not.toHaveBeenCalled();
    expect(dolu.tx.auditLog.create).not.toHaveBeenCalled();

    // Tavanın bir altı: bu çağrı GEÇER ama ücretli çağrı tavanını doldurur →
    // kalan hak 0 (eskiden yalnız başarı sayacına bakıp 5 deniyordu).
    const alti = rig("STANDART", { paidCalls: LIMITED_PAID_CALL_LIMIT - 1 });
    await expect(alti.svc.enrich(alti.user)).resolves.toMatchObject({ remainingSuggestions: 0 });
  });

  it("kalan hak İKİ tavanın küçüğü: ücretli çağrı tavanına dayanan firmaya fazla hak söylenmez", async () => {
    // 2 başarı + 15 ücretli başarısızlık = 17 ücretli çağrı. 3. başarıdan sonra
    // başarı sayacına göre 3 hak kalır ama ücretli çağrı tavanı (18) dolmuştur:
    // sonraki istek reddedilir → doğru cevap 0 (eskiden "kalan: 3" deniyordu).
    const dayanan = rig("STANDART", { succeeded: 2, paidCalls: 17 });
    await expect(dayanan.svc.enrich(dayanan.user)).resolves.toMatchObject({ remainingSuggestions: 0 });

    // Ücretli tavan başarı tavanından ÖNCE dolacaksa onu söyler (18 − 15 − 1 = 2 < 3).
    const yakin = rig("STANDART", { succeeded: 2, paidCalls: 15 });
    await expect(yakin.svc.enrich(yakin.user)).resolves.toMatchObject({ remainingSuggestions: 2 });

    // Ücretli tavan uzaktaysa başarı sayacı belirler (6 − 2 − 1 = 3).
    const uzak = rig("STANDART", { succeeded: 2, paidCalls: 2 });
    await expect(uzak.svc.enrich(uzak.user)).resolves.toMatchObject({ remainingSuggestions: 3 });
  });

  it("remainingAfterSuccess: söylenen hak kadar istek gerçekten GEÇER, bir fazlası reddedilir (iki tavan da)", () => {
    // Kapının kendisiyle tutarlılık: her başarı iki sayacı birer artırır.
    const kapidanGecer = (succeeded: number, paidCalls: number) =>
      succeeded < LIMITED_SUGGESTION_LIMIT && paidCalls < LIMITED_PAID_CALL_LIMIT;
    for (let succeeded = 0; succeeded < LIMITED_SUGGESTION_LIMIT; succeeded++) {
      for (let paidCalls = succeeded; paidCalls < LIMITED_PAID_CALL_LIMIT; paidCalls++) {
        const kalan = remainingAfterSuccess(succeeded, paidCalls);
        expect(kalan).toBeGreaterThanOrEqual(0);
        // Bu deneme başarıyla bitti → sayaçlar +1; ardından `kalan` başarı daha geçer…
        for (let i = 0; i < kalan; i++) {
          expect(kapidanGecer(succeeded + 1 + i, paidCalls + 1 + i)).toBe(true);
        }
        // …ve bir sonraki istek kapıda durur.
        expect(kapidanGecer(succeeded + 1 + kalan, paidCalls + 1 + kalan)).toBe(false);
      }
    }
  });

  it("ücretli çağrı tavanının KENDİ metni var: '6 öneri aldınız, hakkınız doldu' DENMEZ (firma 6 öneri almadı)", async () => {
    const r = rig("STANDART", { succeeded: 2, paidCalls: LIMITED_PAID_CALL_LIMIT });
    const err = await r.svc.enrich(r.user).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as ForbiddenException).getResponse() as { message: string; i18nKey: string };
    expect(body.i18nKey).toBe("api.ai.profilTanitimDenemeSiniriDoldu");
    expect(body.message).toMatch(/toplam deneme sınırına \(18\) ulaşıldı/);
    expect(body.message).toMatch(/firmanızı doğrulayın/);
    expect(body.message).not.toMatch(/toplam 6 AI tanıtım önerisi/);
    expect(body.message).not.toMatch(/hakkınız doldu/);
    expect(r.ai.callAi).not.toHaveBeenCalled();
    expect(r.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("iki tavan da dolduysa başarı hakkı metni geçerlidir (firma gerçekten 6 öneri aldı)", async () => {
    const r = rig("STANDART", { succeeded: LIMITED_SUGGESTION_LIMIT, paidCalls: LIMITED_PAID_CALL_LIMIT });
    const err = await r.svc.enrich(r.user).catch((e: unknown) => e);
    const body = (err as ForbiddenException).getResponse() as { message: string; i18nKey: string };
    expect(body.i18nKey).toBe("api.ai.profilTanitimHakkiDoldu");
    expect(body.message).toMatch(/toplam 6 AI tanıtım önerisi/);
  });

  it("doğrulaması incelemedeki / reddedilmiş firmada iki tavanda da durum metni basılır (bağlam metni değil)", async () => {
    for (const [status, key] of [
      ["PENDING", "api.entitlement.verificationPending"],
      ["REJECTED", "api.entitlement.verificationRejected"],
    ] as const) {
      const r = rig("STANDART", { succeeded: 2, paidCalls: LIMITED_PAID_CALL_LIMIT });
      (r.user as { companyVerificationStatus: string }).companyVerificationStatus = status;
      const err = await r.svc.enrich(r.user).catch((e: unknown) => e);
      expect(((err as ForbiddenException).getResponse() as { i18nKey: string }).i18nKey).toBe(key);
    }
  });

  it("aynı anda gelen ikinci istek REDDEDİLİR — süren deneme varken AI çağrısı ve deneme kaydı yok (X23)", async () => {
    const r = rig("STANDART", { inFlight: 1 });
    await expect(r.svc.enrich(r.user)).rejects.toThrow(ConflictException);
    expect(r.tx.auditLog.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: "c1", action: "company.profile_enrich_attempt" }),
      select: { id: true },
    });
    // Bitmiş sayılması için denemeye bağlı bitiş kaydı aranır.
    expect(r.tx.auditLog.count).toHaveBeenCalledWith({
      where: { action: "company.profile_enrich_settled", entityId: { in: ["d0"] } },
    });
    expect(r.ai.callAi).not.toHaveBeenCalled();
    expect(r.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("ProfileEnrichService — tam erişimli firma: yalnız günlük sınır + AI bütçesi", () => {
  it.each(["SILVER", "GOLD"])("%s ömürlük sayaçtan MUAF — kalan hak null", async (tier) => {
    const r = rig(tier, { succeeded: 99, paidCalls: 99, inFlight: 1 });
    await expect(r.svc.enrich(r.user)).resolves.toMatchObject({ remainingSuggestions: null });
    expect(r.tx.auditLog.count).not.toHaveBeenCalledWith(BASARILI_SAYIM);
    expect(r.tx.aiUsage.count).not.toHaveBeenCalled();
    // Süren-istek kilidi de yalnız sınırlı firmaya.
    expect(r.tx.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("bütçe kapısından geçer: çağrı `callAi` ile, özellik anahtarı ve erişim değişmedi", async () => {
    const r = rig("GOLD");
    await r.svc.enrich(r.user);
    expect(r.ai.callAi).toHaveBeenCalledTimes(1);
    expect(r.ai.callAi).toHaveBeenCalledWith(
      r.user,
      expect.objectContaining({
        feature: "profile_enrich",
        anyOf: ["company:manage"],
        minTier: "STANDART",
      }),
    );
  });
});

describe("ProfileEnrichService — günlük deneme sınırı (herkes)", () => {
  it.each(["STANDART", "GOLD"])("%s: günün 3 denemesi dolduysa REDDEDİLİR, AI çağrılmaz", async (tier) => {
    const r = rig(tier, { attemptsToday: 3 });
    await expect(r.svc.enrich(r.user)).rejects.toThrow(BadRequestException);
    await expect(r.svc.enrich(r.user)).rejects.toThrow(/Günlük AI tanıtım önerisi sınırına ulaşıldı \(3\)/);
    expect(r.ai.callAi).not.toHaveBeenCalled();
    expect(r.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("deneme kaydı AI çağrısından ÖNCE yazılır (başarısız deneme de günlük sayaca girer)", async () => {
    const r = rig("GOLD", { attemptsToday: 2 });
    r.ai.callAi.mockRejectedValue(new Error("boom"));
    await expect(r.svc.enrich(r.user)).rejects.toThrow(ServiceUnavailableException);
    expect(r.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "company.profile_enrich_attempt",
          tenantId: "c1",
          actorId: "u1",
        }),
      }),
    );
    expect(r.tx.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      r.ai.callAi.mock.invocationCallOrder[0]!,
    );
  });

  /**
   * PD-07: pencere UTC gece yarısında başlıyordu (TR 03:00). Sınır metni "yarın
   * tekrar deneyin" der; akşam sınıra takılan kullanıcı ertesi gün 00:00-03:00
   * (TR) arasında hâlâ reddediliyordu. Gün = uygulama takvim günü
   * (Europe/Istanbul, `common/time/app-calendar.ts`).
   */
  describe("gün = uygulama takvim günü (Europe/Istanbul), UTC günü değil", () => {
    const GUNLUK_SAYIM = (from: string) => ({
      where: {
        tenantId: "c1",
        action: "company.profile_enrich_attempt",
        createdAt: { gte: new Date(from) },
      },
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.each([
      // şimdi (UTC) → pencerenin başı (UTC) = o anın İstanbul gününün 00:00'ı
      ["TR 10 Eki 01:30 (UTC'de hâlâ 9 Eki)", "2026-10-09T22:30:00.000Z", "2026-10-09T21:00:00.000Z"],
      ["TR 9 Eki 23:59 (gece yarısından hemen önce)", "2026-10-09T20:59:59.000Z", "2026-10-08T21:00:00.000Z"],
      ["TR 10 Eki 00:00 (tam gece yarısı)", "2026-10-09T21:00:00.000Z", "2026-10-09T21:00:00.000Z"],
      ["TR 9 Eki 13:00 (gün ortası)", "2026-10-09T10:00:00.000Z", "2026-10-08T21:00:00.000Z"],
      ["TR 10 Eki 02:59 (eski pencerenin son dakikası)", "2026-10-09T23:59:00.000Z", "2026-10-09T21:00:00.000Z"],
    ])("%s", async (_ad, simdi, pencereBasi) => {
      expect(profileEnrichDayStart(new Date(simdi))).toEqual(new Date(pencereBasi));

      // Servis de aynı sınırla sayar (yalnız saat sahte; söz kuyruğu gerçek).
      jest.useFakeTimers({
        now: new Date(simdi),
        doNotFake: [
          "hrtime",
          "nextTick",
          "performance",
          "queueMicrotask",
          "setImmediate",
          "clearImmediate",
          "setInterval",
          "clearInterval",
          "setTimeout",
          "clearTimeout",
        ],
      });
      const r = rig("GOLD");
      await r.svc.enrich(r.user);
      expect(r.tx.auditLog.count).toHaveBeenCalledWith(GUNLUK_SAYIM(pencereBasi));
    });

    it("dün akşam (TR) sınıra takılan firma gece yarısından SONRA yeniden deneyebilir; 03:00'ü beklemez", async () => {
      // Denemeler TR 9 Eki 21:00-22:00 (UTC 18:00-19:00); şimdi TR 10 Eki 00:10 (UTC 9 Eki 21:10).
      const denemeler = ["2026-10-09T18:00:00.000Z", "2026-10-09T18:30:00.000Z", "2026-10-09T19:00:00.000Z"].map(
        (d) => new Date(d),
      );
      jest.useFakeTimers({
        now: new Date("2026-10-09T21:10:00.000Z"),
        doNotFake: [
          "hrtime",
          "nextTick",
          "performance",
          "queueMicrotask",
          "setImmediate",
          "clearImmediate",
          "setInterval",
          "clearInterval",
          "setTimeout",
          "clearTimeout",
        ],
      });
      const r = rig("GOLD");
      // Sayaç gerçek sorgu gibi davranır: yalnız pencere başından sonraki denemeler.
      r.tx.auditLog.count.mockImplementation(
        async (args: { where: { action: string; createdAt?: { gte: Date } } }) =>
          args.where.action === "company.profile_enrich_attempt" && args.where.createdAt
            ? denemeler.filter((d) => d >= args.where.createdAt!.gte).length
            : 0,
      );
      await expect(r.svc.enrich(r.user)).resolves.toMatchObject({ remainingSuggestions: null });
      expect(r.ai.callAi).toHaveBeenCalledTimes(1);
    });
  });
});

describe("ProfileEnrichService — boşa çağrı yok", () => {
  it("yazacak olgu yoksa (yalnız ad + konum) AI çağrılmaz, günlük hak da yanmaz", async () => {
    const r = rig("STANDART");
    r.prisma.company.findUnique.mockResolvedValue({
      name: "Acme",
      companyType: null,
      legalFormLocal: null,
      country: "TR",
      city: "İzmir",
      industry: null,
      services: [],
      activities: [],
      sellerCategoryIds: [],
      sellerSubCategoryIds: [],
      buyerCategoryIds: [],
      buyerSubCategoryIds: [],
    });
    await expect(r.svc.enrich(r.user)).rejects.toThrow(BadRequestException);
    await expect(r.svc.enrich(r.user)).rejects.toThrow(/sektörünüzü, hizmetlerinizi/);
    expect(r.ai.callAi).not.toHaveBeenCalled();
    expect(r.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("AI yapılandırılmamışsa 503 — hiçbir şey okunmaz, deneme yazılmaz", async () => {
    const r = rig("GOLD");
    r.ai.isEnabled = false;
    await expect(r.svc.enrich(r.user)).rejects.toThrow(ServiceUnavailableException);
    expect(r.prisma.company.findUnique).not.toHaveBeenCalled();
    expect(r.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("ProfileEnrichService — AI çağrısı, başarı izi ve bitiş kaydı", () => {
  it("bütçe reddi 'birkaç saniye sonra deneyin' 503'üne ÇEVRİLMEZ — olduğu gibi iletilir (X21)", async () => {
    const r = rig("STANDART");
    const red = new AiBudgetExceededException("budget");
    r.ai.callAi.mockRejectedValue(red);
    await expect(r.svc.enrich(r.user)).rejects.toBe(red);
    expect(r.audit.log).not.toHaveBeenCalledWith(BASARI_IZI);
  });

  it("beklenmeyen (HTTP olmayan) hata 503; başarı izi yok", async () => {
    const r = rig("STANDART");
    r.ai.callAi.mockRejectedValue(new Error("boom"));
    await expect(r.svc.enrich(r.user)).rejects.toThrow(ServiceUnavailableException);
    expect(r.audit.log).not.toHaveBeenCalledWith(BASARI_IZI);
  });

  it("akış bitince (hata dahil) denemeye bağlı BİTİŞ kaydı eklenir — deneme satırı güncellenmez, audit append-only (X23)", async () => {
    const r = rig("STANDART");
    r.ai.callAi.mockRejectedValue(new Error("boom"));
    await expect(r.svc.enrich(r.user)).rejects.toThrow(ServiceUnavailableException);
    expect(r.audit.log).toHaveBeenCalledTimes(1);
    expect(r.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.profile_enrich_settled",
        tenantId: "c1",
        entityType: "audit_log",
        entityId: "att1",
      }),
    );
  });

  it("başarıda bitiş kaydı, başarı izi YAZILDIKTAN SONRA eklenir (arada ikinci istek hak görmez)", async () => {
    const r = rig("STANDART");
    await r.svc.enrich(r.user);
    expect(actions(r.audit.log)).toEqual([
      "company.profile_enriched",
      "company.profile_enrich_settled",
    ]);
  });

  it("tam erişimli firmada bitiş kaydı yazılmaz; başarı izi yine yazılır", async () => {
    const r = rig("SILVER");
    await r.svc.enrich(r.user);
    expect(actions(r.audit.log)).toEqual(["company.profile_enriched"]);
  });

  it("boş taslak hakkı yakmaz: başarı izi YAZILMAZ, kullanıcıya 'elle yazın / veri ekleyin' denir", async () => {
    const r = rig("STANDART");
    r.ai.callAi.mockResolvedValue({ text: JSON.stringify({ aboutText: "  " }) });
    await expect(r.svc.enrich(r.user)).rejects.toThrow(/tanıtım yazamadı/);
    expect(r.audit.log).not.toHaveBeenCalledWith(BASARI_IZI);
  });

  it("işlenemeyen çıktı hakkı yakmaz: 503, başarı izi yok", async () => {
    const r = rig("STANDART");
    r.ai.callAi.mockResolvedValue({ text: "JSON değil" });
    await expect(r.svc.enrich(r.user)).rejects.toThrow(ServiceUnavailableException);
    expect(r.audit.log).not.toHaveBeenCalledWith(BASARI_IZI);
  });

  it("başarılı taslakta ömürlük hakkın izi (company.profile_enriched) AWAIT'li ve kritik yazılır", async () => {
    const r = rig("STANDART");
    let yazildi = false;
    r.audit.log.mockImplementation(async () => {
      await Promise.resolve();
      yazildi = true;
    });
    const draft = await r.svc.enrich(r.user);
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
