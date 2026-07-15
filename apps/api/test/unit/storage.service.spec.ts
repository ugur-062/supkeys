/**
 * StorageService — INV-STORAGE-1 (iki-bucket ayrımı) kilidi.
 *
 * Public URL YALNIZ `{env}/tenant-profile/` prefix'ine uygulanabilir; diğer HER
 * anahtar private'tır (fail-closed) ve public URL'e çevrilemez. Hassas (KYC/
 * teklif/ihale/sipariş) anahtarını public bucket'a yazma denemesi runtime'da
 * fırlatır. Bkz. docs/invariants.md INV-STORAGE-1.
 */
import type { ConfigService } from "@nestjs/config";
import { StorageService } from "../../src/modules/storage/storage.service";

/** Sabit env map'inden okuyan minimal ConfigService taklidi. */
function configFor(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

/**
 * onModuleInit R2'ya bağlanır — unit testte özel alanları elle set edip
 * ağ olmadan saf mantığı (classifyKey/getPublicUrl/assertKeyBucket) test ederiz.
 */
function makeService(
  env: Record<string, string | undefined> = {},
): StorageService {
  const svc = new StorageService(configFor(env));
  (svc as unknown as { envPrefix: string }).envPrefix = "prod";
  (svc as unknown as { publicBucket: string }).publicBucket = "rothern-public";
  (svc as unknown as { privateBucket: string }).privateBucket = "rothern-prod";
  return svc;
}

const PRIVATE_KEYS = [
  "company-docs/co_123/kyc-uuid-vergi.pdf",
  "listing-docs/li_9/uuid-sartname.pdf",
  "listing-bids/li_9/co_7/uuid-teklif.pdf",
  "company-orders/or_1/invoice/uuid-fatura.pdf",
  "prod/some-unknown-prefix/x.png", // bilinmeyen → private (fail-closed)
  "tenant-profile/co_1/logo.png", // env-öneki YOK → allowlist eşleşmez → private
];

describe("StorageService — classifyKey (INV-STORAGE-1 tek kaynağı)", () => {
  it("yalnız {env}/tenant-profile/ prefix'i public", () => {
    const svc = makeService();
    expect(svc.classifyKey("prod/tenant-profile/co_1/logo-co_1-x.png")).toBe(
      "public",
    );
  });

  it("hassas + bilinmeyen + env-öneksiz anahtarların hepsi private (fail-closed)", () => {
    const svc = makeService();
    for (const key of PRIVATE_KEYS) {
      expect(svc.classifyKey(key)).toBe("private");
    }
  });
});

describe("StorageService — getPublicUrl allowlist (INV-STORAGE-1)", () => {
  it("public anahtar + base set → kalıcı public URL", () => {
    const svc = makeService({ R2_PUBLIC_BASE_URL: "https://cdn.rothern.com" });
    expect(svc.getPublicUrl("prod/tenant-profile/co_1/logo-co_1-x.png")).toBe(
      "https://cdn.rothern.com/prod/tenant-profile/co_1/logo-co_1-x.png",
    );
  });

  it("HASSAS anahtar public URL'e ÇEVRİLEMEZ → null (base set olsa bile)", () => {
    const svc = makeService({ R2_PUBLIC_BASE_URL: "https://cdn.rothern.com" });
    for (const key of PRIVATE_KEYS) {
      expect(svc.getPublicUrl(key)).toBeNull();
    }
  });

  it("public anahtar ama base yok → null (caller presigned'a fallback)", () => {
    const svc = makeService({}); // R2_PUBLIC_BASE_URL yok
    expect(
      svc.getPublicUrl("prod/tenant-profile/co_1/logo-co_1-x.png"),
    ).toBeNull();
  });

  it("boş/null anahtar → null", () => {
    const svc = makeService({ R2_PUBLIC_BASE_URL: "https://cdn.rothern.com" });
    expect(svc.getPublicUrl(null)).toBeNull();
    expect(svc.getPublicUrl(undefined)).toBeNull();
    expect(svc.getPublicUrl("")).toBeNull();
  });
});

describe("StorageService — assertKeyBucket (yanlış-bucket'a yazma kilidi)", () => {
  it("KYC/teklif anahtarını PUBLIC bucket'a yazma denemesi fırlatır", async () => {
    const svc = makeService();
    await expect(
      svc.generatePresignedPut("public", PRIVATE_KEYS[0]!, "application/pdf"),
    ).rejects.toThrow(/INV-STORAGE-1/);
    await expect(
      svc.generatePresignedGet("public", PRIVATE_KEYS[2]!),
    ).rejects.toThrow(/INV-STORAGE-1/);
  });

  it("profil anahtarını PRIVATE bucket'a yazma denemesi de fırlatır (simetrik)", async () => {
    const svc = makeService();
    await expect(
      svc.generatePresignedPut(
        "private",
        "prod/tenant-profile/co_1/logo-co_1-x.png",
        "image/png",
      ),
    ).rejects.toThrow(/INV-STORAGE-1/);
  });
});
