/**
 * Faz 5 — yabancı belge seti (ülke-farkında zorunlu doküman) + VIES (AB VAT)
 * oto-doğrulama.
 */
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyDocsService } from "../../src/modules/company-docs/company-docs.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";
import { makeAuthService } from "./make-auth-service";

function docsService() {
  const storage = {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn().mockResolvedValue("https://r2/get"),
    getPublicUrl: jest.fn((k: string) => `https://r2/${k}`),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    // KYC belgeleri kısa ömürlü presigned GET ile sunulur — gerçek servisle
    // aynı sözleşme: boş değer null, dolu değer URL.
    presignStoredObject: jest.fn(async (_bucket: string, v: string | null) =>
      v ? `https://r2/presigned/${v}` : null,
    ),
    // commit, nesnenin R2'da var olduğunu doğrular (assertUploadedObjectValid).
    checkExists: jest.fn(async () => ({
      exists: true,
      size: 1024,
      contentType: "application/pdf",
    })),
  };
  return new CompanyDocsService(
    prisma as never,
    storage as never,
    new AuditService(prisma as never),
  );
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("ülke-farkında belge seti", () => {
  it("TR firma 6 belge ister; 3'le submit reddedilir", async () => {
    const svc = docsService();
    const co = await makeCompany(prisma, {
      country: "TR",
      docTradeRegistryUrl: "k1",
      docTaxPlateUrl: "k2",
      docIdFrontUrl: "k3",
    });
    const res = await svc.get(co.id);
    expect(res.required).toHaveLength(6);
    await expect(svc.submit(co.id)).rejects.toThrow(/eksik|belge/i);
  });

  it("yabancı firma 3 belge yeterli → PENDING", async () => {
    const svc = docsService();
    const co = await makeCompany(prisma, {
      // Doc-akışı UNVERIFIED firmadan başlar (factory default VERIFIED — INV-KYC-1;
      // submit()/commit() zaten-doğrulanmışı reddeder → explicit UNVERIFIED geç).
      companyVerificationStatus: "UNVERIFIED",
      country: "DE",
      docTradeRegistryUrl: "k1", // Certificate of Incorporation
      docTaxPlateUrl: "k2", // Tax/VAT Certificate
      docIdFrontUrl: "k3", // Authorized Signatory ID
    });
    const res = await svc.get(co.id);
    expect(res.required.sort()).toEqual(["idFront", "taxPlate", "tradeRegistry"]);
    // BELGE SETİ ülkeye göre (3 vs 6) ama KİMLİK ALANLARI herkese zorunlu
    // (2026-09-14): sicil numarası + banka bilgisi + hesap sahibi. Eskiden
    // yabancıda hiç istenmiyordu — "yurt içi / yurt dışı" ayrımıydı ve
    // sicil BELGESİNİ isteyip numarasını istememek tutarsızdı.
    // DE IBAN ülkesi → mod-97 doğrulanır.
    // SWIFT/BIC firma doğrulamasında HER ÜLKEDE zorunlu (2026-09-27).
    await svc.submit(co.id, {
      tradeRegistryNo: "HRB 12345",
      iban: "DE89370400440532013000",
      ibanHolder: "Muster GmbH",
      bankSwiftBic: "COBADEFFXXX",
    });
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("PENDING");
  });

  it("yabancı firma: sicil no ve banka bilgisi ZORUNLU — belge tam olsa da", async () => {
    const svc = docsService();
    const co = await makeCompany(prisma, {
      companyVerificationStatus: "UNVERIFIED",
      country: "DE",
      docTradeRegistryUrl: "k1",
      docTaxPlateUrl: "k2",
      docIdFrontUrl: "k3",
    });
    await expect(svc.submit(co.id)).rejects.toThrow(/Sicil \/ kayıt/);
    await expect(
      svc.submit(co.id, { tradeRegistryNo: "HRB 1" }),
    ).rejects.toThrow(/IBAN giriniz/);
    // IBAN kullanan ülkede kontrol hanesi doğrulanır.
    await expect(
      svc.submit(co.id, { tradeRegistryNo: "HRB 1", iban: "DE00370400440532013000", ibanHolder: "X", bankSwiftBic: "COBADEFF" }),
    ).rejects.toThrow(/kontrol hanesi/);
    // SWIFT/BIC doğrulamada her ülkede zorunlu (kullanıcı kararı 2026-09-27) — IBAN geçerli olsa da.
    await expect(
      svc.submit(co.id, { tradeRegistryNo: "HRB 1", iban: "DE89370400440532013000", ibanHolder: "X" }),
    ).rejects.toThrow(/SWIFT/);
    await expect(
      svc.submit(co.id, { tradeRegistryNo: "HRB 1", iban: "DE89370400440532013000", ibanHolder: "X", bankSwiftBic: "DEUT" }),
    ).rejects.toThrow(/SWIFT/);
  });

  it("TR firmada da SWIFT zorunlu (IBAN'ın yanında)", async () => {
    const svc = docsService();
    const co = await makeCompany(prisma, {
      companyVerificationStatus: "UNVERIFIED",
      country: "TR",
      docTradeRegistryUrl: "k1",
      docTaxPlateUrl: "k2",
      docIdFrontUrl: "k3",
      docIdBackUrl: "k4",
      docSignatureCircularUrl: "k5",
      docActivityCertUrl: "k6",
    });
    const base = { mersisNo: "0123456789012345", tradeRegistryNo: "123456", iban: "TR330006100519786457841326", ibanHolder: "Acme A.Ş." };
    await expect(svc.submit(co.id, base)).rejects.toThrow(/SWIFT/);
    await svc.submit(co.id, { ...base, bankSwiftBic: "TGBATRIS" });
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("PENDING");
    expect(c.bankSwiftBic).toBe("TGBATRIS");
  });

  it("IBAN kullanmayan ülkede (CN) hesap numarası serbest biçim ama ZORUNLU", async () => {
    const svc = docsService();
    const co = await makeCompany(prisma, {
      companyVerificationStatus: "UNVERIFIED",
      country: "CN",
      // CN'de vergi belgesi istenmez (营业执照 onu kapsar) — sicil + kimlik.
      docTradeRegistryUrl: "k1",
      docIdFrontUrl: "k2",
    });
    await expect(
      svc.submit(co.id, { tradeRegistryNo: "91110000", ibanHolder: "示例" }),
    ).rejects.toThrow(/Hesap numarası zorunlu/);
    // IBAN'sız ülke: hesap no + SWIFT + banka adı (2026-09-27).
    await expect(
      svc.submit(co.id, { tradeRegistryNo: "91110000", iban: "6222021234567890123", ibanHolder: "示例", bankSwiftBic: "BKCHCNBJ" }),
    ).rejects.toThrow(/Banka adı/);
    await svc.submit(co.id, {
      tradeRegistryNo: "91110000",
      iban: "6222021234567890123",
      ibanHolder: "示例有限公司",
      bankSwiftBic: "BKCHCNBJ",
      bankName: "Bank of China",
    });
    const c = await prisma.company.findUniqueOrThrow({ where: { id: co.id } });
    expect(c.companyVerificationStatus).toBe("PENDING");
  });

  it("yabancı firma eksik belge → submit reddedilir", async () => {
    const svc = docsService();
    const co = await makeCompany(prisma, {
      country: "DE",
      docTradeRegistryUrl: "k1",
    });
    await expect(svc.submit(co.id)).rejects.toThrow(/eksik|belge/i);
  });

  it("GÜVENLİK: başka firmanın/rastgele key'i commit edilemez", async () => {
    const svc = docsService();
    const co = await makeCompany(prisma, {
      companyVerificationStatus: "UNVERIFIED", // commit() doğrulanmışı reddeder
      country: "TR",
    });
    // Başka firmanın klasörüne işaret eden key reddedilir.
    await expect(
      svc.commit(co.id, "taxPlate", `company-docs/BASKA-FIRMA/x.pdf`),
    ).rejects.toThrow(/anahtar|geçersiz/i);
    // Doğru prefix'li key kabul edilir — KEY saklanır (public URL değil;
    // okuma tarafı presigned GET üretir).
    const ok = await svc.commit(
      co.id,
      "taxPlate",
      `company-docs/${co.id}/x.pdf`,
    );
    expect(ok.ok).toBe(true);
    const db = await prisma.company.findUniqueOrThrow({
      where: { id: co.id },
      select: { docTaxPlateUrl: true },
    });
    expect(db.docTaxPlateUrl).toBe(`company-docs/${co.id}/x.pdf`);
  });
});

/**
 * VIES — gerçek REST biçimi (2026-09-27, canlı uçla doğrulandı):
 * `{ isValid, userError, name, address, … }`. Eskiden testler `{ valid }`
 * biçimini taklit ediyordu ve servis de onu okuyordu → canlıda HER AB firması
 * "geçersiz" çıkıyordu; testler yeşildi çünkü yanlış biçimi sınıyordu.
 */
describe("VIES — AB VAT oto-doğrulama", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const viesReply = (body: unknown) =>
    jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as never;

  it("geçerli VAT (isValid:true) → valid + firma adı", async () => {
    const { service } = makeAuthService();
    global.fetch = viesReply({
      isValid: true,
      userError: "VALID",
      name: "ACME GmbH",
      address: "Berlin",
    });
    const r = await service.viesCheck("DE", "811234567");
    expect(r.valid).toBe(true);
    expect(r.name).toBe("ACME GmbH");
    expect(r.unavailable).toBeUndefined();
  });

  it("Almanya adı paylaşmaz: name '---' → null (unvana kopyalanmaz)", async () => {
    const { service } = makeAuthService();
    global.fetch = viesReply({
      isValid: true,
      userError: "VALID",
      name: "---",
      address: "---",
    });
    const r = await service.viesCheck("DE", "811569869");
    expect(r).toMatchObject({ valid: true, name: null, address: null });
  });

  it("geçersiz VAT (isValid:false, INVALID) → valid:false, unavailable yok", async () => {
    const { service } = makeAuthService();
    global.fetch = viesReply({ isValid: false, userError: "INVALID" });
    const r = await service.viesCheck("DE", "000000000");
    expect(r.valid).toBe(false);
    expect(r.unavailable).toBeUndefined();
  });

  it.each(["MS_UNAVAILABLE", "TIMEOUT", "SERVICE_UNAVAILABLE", "MS_MAX_CONCURRENT_REQ"])(
    "HTTP 200 + userError %s → unavailable (geçersiz DEĞİL)",
    async (userError) => {
      const { service } = makeAuthService();
      global.fetch = viesReply({ isValid: false, userError });
      const r = await service.viesCheck("DE", "811234567");
      expect(r).toMatchObject({ valid: false, unavailable: true });
    },
  );

  it("hata sarmalayıcısı (actionSucceed:false) → unavailable", async () => {
    const { service } = makeAuthService();
    global.fetch = viesReply({ actionSucceed: false, errorWrappers: [{ error: "MS_UNAVAILABLE" }] });
    const r = await service.viesCheck("FR", "12345678901");
    expect(r).toMatchObject({ valid: false, unavailable: true });
  });

  it("Yunanistan EL kodu, önek ve etiket atılır, Arap-Hint rakamlar çevrilir", async () => {
    const { service } = makeAuthService();
    const fetchMock = viesReply({ isValid: false, userError: "INVALID" });
    global.fetch = fetchMock;
    await service.viesCheck("GR", "EL ٠٩٤٠١٤٢٠١");
    const calledUrl = String((fetchMock as unknown as jest.Mock).mock.calls[0][0]);
    expect(calledUrl).toContain("/ms/EL/vat/094014201");
  });

  it("GÜVENLİK: countryCode/vatNumber URL'e enjekte edilemez (path sanitize)", async () => {
    const { service } = makeAuthService();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: false, userError: "INVALID" }),
    });
    global.fetch = fetchMock as never;
    // Kötü niyetli girdi: path traversal + query enjeksiyonu denemesi.
    await service.viesCheck("DE/../..", "81 12/34?x=1");
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    // Ülke kodu sadece harfe indirgenir; segment sınırı (/) enjekte edilemez.
    expect(calledUrl).toContain("/ms/DE/vat/");
    expect(calledUrl).not.toContain("..");
    expect(calledUrl).not.toContain("?x=1");
    // VAT alfanümerik dışını atar → "811234x1"
    expect(calledUrl.endsWith("/vat/811234X1")).toBe(true);
  });

  it("servis hatası → unavailable (patlamaz)", async () => {
    const { service } = makeAuthService();
    global.fetch = jest.fn().mockRejectedValue(new Error("VIES down")) as never;
    const r = await service.viesCheck("DE", "811234567");
    expect(r.valid).toBe(false);
    expect(r.unavailable).toBe(true);
  });

  it("firma bağlamıyla sorgu audit'e yazılır (admin görür; şema değişikliği yok)", async () => {
    const { service, audit } = makeAuthService();
    global.fetch = viesReply({ isValid: true, userError: "VALID", name: "ACME GmbH", address: "Berlin" });
    await service.viesCheck("DE", "DE 811234567", { companyId: "c1", userId: "u1", source: "manual" });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.vies_checked",
        actorType: "company",
        actorId: "u1",
        entityType: "company",
        entityId: "c1",
        metadata: expect.objectContaining({
          countryCode: "DE",
          vatNumber: "811234567",
          valid: true,
          unavailable: false,
          name: "ACME GmbH",
          source: "manual",
        }),
      }),
    );
  });

  it("firma bağlamı yoksa audit yazılmaz", async () => {
    const { service, audit } = makeAuthService();
    global.fetch = viesReply({ isValid: true, userError: "VALID" });
    await service.viesCheck("DE", "811234567");
    expect(audit.log).not.toHaveBeenCalled();
  });
});
