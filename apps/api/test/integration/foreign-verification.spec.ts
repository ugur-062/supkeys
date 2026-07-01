/**
 * Faz 5 — yabancı belge seti (ülke-farkında zorunlu doküman) + VIES (AB VAT)
 * oto-doğrulama.
 */
import { CompanyDocsService } from "../../src/modules/company-docs/company-docs.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompany } from "./factories";
import { makeAuthService } from "./make-auth-service";

function docsService() {
  const storage = {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn().mockResolvedValue("https://r2/get"),
    getPublicUrl: jest.fn((k: string) => `https://r2/${k}`),
    deleteObject: jest.fn(),
  };
  return new CompanyDocsService(prisma as never, storage as never);
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
      country: "DE",
      docTradeRegistryUrl: "k1", // Certificate of Incorporation
      docTaxPlateUrl: "k2", // Tax/VAT Certificate
      docIdFrontUrl: "k3", // Authorized Signatory ID
    });
    const res = await svc.get(co.id);
    expect(res.required.sort()).toEqual(["idFront", "taxPlate", "tradeRegistry"]);
    await svc.submit(co.id);
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
    const co = await makeCompany(prisma, { country: "TR" });
    // Başka firmanın klasörüne işaret eden key reddedilir.
    await expect(
      svc.commit(co.id, "taxPlate", `company-docs/BASKA-FIRMA/x.pdf`),
    ).rejects.toThrow(/anahtar|geçersiz/i);
    // Doğru prefix'li key kabul edilir.
    const ok = await svc.commit(
      co.id,
      "taxPlate",
      `company-docs/${co.id}/x.pdf`,
    );
    expect(ok.url).toContain(`company-docs/${co.id}/`);
  });
});

describe("VIES — AB VAT oto-doğrulama", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("geçerli VAT → valid + firma adı", async () => {
    const { service } = makeAuthService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true, name: "ACME GmbH", address: "Berlin" }),
    }) as never;
    const r = await service.viesCheck("DE", "811234567");
    expect(r.valid).toBe(true);
    expect(r.name).toBe("ACME GmbH");
  });

  it("geçersiz VAT → valid:false", async () => {
    const { service } = makeAuthService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false }),
    }) as never;
    const r = await service.viesCheck("DE", "000");
    expect(r.valid).toBe(false);
  });

  it("GÜVENLİK: countryCode/vatNumber URL'e enjekte edilemez (path sanitize)", async () => {
    const { service } = makeAuthService();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false }),
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
    expect(calledUrl.endsWith("/vat/811234x1")).toBe(true);
  });

  it("servis hatası → unavailable (patlamaz)", async () => {
    const { service } = makeAuthService();
    global.fetch = jest.fn().mockRejectedValue(new Error("VIES down")) as never;
    const r = (await service.viesCheck("DE", "811234567")) as {
      valid: boolean;
      unavailable?: boolean;
    };
    expect(r.valid).toBe(false);
    expect(r.unavailable).toBe(true);
  });
});
