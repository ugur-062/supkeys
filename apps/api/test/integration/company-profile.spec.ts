/**
 * Faz 4 — Kurumsal Kimlik profili: düzenlenebilir kimlik kalemleri (MERSİS/KEP/
 * IBAN) doğrulaması + kaydı.
 */
import { BadRequestException } from "@nestjs/common";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyProfileService } from "../../src/modules/company-profile/company-profile.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

// Standart geçerli TR IBAN örneği (mod-97).
const VALID_IBAN = "TR330006100519786457841326";

function makeService() {
  const storage = {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn(),
    deleteObject: jest.fn(),
  };
  return new CompanyProfileService(
    prisma as never,
    storage as never,
    {} as never, // categories — bu spec kategori id'si göndermez
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

/**
 * Kimlik/IBAN alanları YALNIZ doğrulama ÖNCESİ değiştirilebilir (2026-07-28
 * kilidi) — bu blok onay öncesi durumu doğrular, o yüzden firmalar UNVERIFIED
 * kurulur. Factory varsayılanı VERIFIED'dır ve kilide takılır.
 */
const makeEditableCompany = (country = "TR") =>
  makeCompanyWithUser(prisma, {
    country,
    companyVerificationStatus: "UNVERIFIED",
  });

describe("company-profile — kurumsal kimlik kalemleri", () => {
  it("geçerli MERSİS/KEP/IBAN kaydedilir (IBAN normalize)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await svc.update(owner.company.id, {
      mersisNo: "1234567890123456",
      kepAddress: "firma@hs01.kep.tr",
      iban: "tr33 0006 1005 1978 6457 8413 26",
      ibanHolder: "Örnek A.Ş.",
    } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.mersisNo).toBe("1234567890123456");
    expect(c.kepAddress).toBe("firma@hs01.kep.tr");
    expect(c.iban).toBe(VALID_IBAN); // boşluksuz + büyük harf
    expect(c.ibanHolder).toBe("Örnek A.Ş.");
  });

  it("geçersiz IBAN reddedilir", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await expect(
      svc.update(owner.company.id, { iban: "TR00 1234" } as never),
    ).rejects.toThrow(/geçerli bir iban/i);
  });

  it("yabancı IBAN gevşek formatla kabul edilir (TR-dışı katı mod-97 yok)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany("DE");
    await svc.update(owner.company.id, {
      iban: "de89 3704 0044 0532 0130 00",
    } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.iban).toBe("DE89370400440532013000");
  });

  it("geçersiz KEP reddedilir", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      svc.update(owner.company.id, {
        kepAddress: "firma@gmail.com",
      } as never),
    ).rejects.toThrow(/KEP/i);
  });

  it("hassas-olmayan görünümde IBAN maskeli döner (banka listesiyle aynı kural)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await svc.update(owner.company.id, {
      iban: VALID_IBAN,
      ibanHolder: "Örnek A.Ş.",
    } as never);

    const pub = await svc.get(owner.company.id, false);
    expect(pub.iban).toBe("TR" + "*".repeat(20) + "1326");
    expect(pub.ibanHolder).toBeNull(); // maskelenmez, tamamen gizli kalır

    const full = await svc.get(owner.company.id, true);
    expect(full.iban).toBe(VALID_IBAN);
  });

  it("PATCH audit izi: changedFields alan ADLARI; IBAN değişimi critical + maskeli", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();

    await svc.update(
      owner.company.id,
      { website: "https://ornek.com", iban: VALID_IBAN } as never,
      owner.auth,
    );
    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "company.profile.updated",
        entityId: owner.company.id,
      },
    });
    expect(row.actorId).toBe(owner.auth.userId);
    expect(row.tenantId).toBe(owner.company.id);
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.changedFields).toEqual(
      expect.arrayContaining(["website", "iban"]),
    );
    expect(meta.ibanMaskedAfter).toBe("TR" + "*".repeat(20) + "1326");
    // Değerler metadata'ya yazılmaz (alan adları + maskeli IBAN referansı hariç).
    expect(JSON.stringify(meta)).not.toContain(VALID_IBAN);
    expect(JSON.stringify(meta)).not.toContain("ornek.com");

    // IBAN'sız değişiklik → audit var ama critical değil (para-yolu değil).
    await svc.update(
      owner.company.id,
      { aboutText: "Hakkımızda" } as never,
      owner.auth,
    );
    const rows = await prisma.auditLog.findMany({
      where: { action: "company.profile.updated" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
  });

  it("boş IBAN → temizlenir (null)", async () => {
    const svc = makeService();
    const owner = await makeEditableCompany();
    await svc.update(owner.company.id, { iban: VALID_IBAN } as never);
    await svc.update(owner.company.id, { iban: "" } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.iban).toBeNull();
  });
});

/**
 * KYC kimlik kilidi — doğrulama başladıktan/bittikten sonra MERSİS, ticaret
 * sicil ve IBAN bu uç noktadan DEĞİŞTİRİLEMEZ. Kilit daha önce yalnız
 * arayüzdeydi (Doğrulama ekranı), Ayarlar formu üzerinden baypas ediliyordu.
 */
describe("company-profile — KYC kimlik kilidi", () => {
  it.each(["PENDING", "VERIFIED"] as const)(
    "%s firmada IBAN/MERSİS/sicil değişikliği reddedilir",
    async (status) => {
      const svc = makeService();
      const owner = await makeCompanyWithUser(prisma, {
        country: "TR",
        companyVerificationStatus: status,
      });
      await expect(
        svc.update(owner.company.id, { iban: VALID_IBAN } as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.update(owner.company.id, {
          mersisNo: "1234567890123456",
        } as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.update(owner.company.id, { tradeRegistryNo: "999" } as never),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it("REJECTED firmada düzeltme için değişiklik SERBEST", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "REJECTED",
    });
    await svc.update(owner.company.id, { iban: VALID_IBAN } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.iban).toBe(VALID_IBAN);
  });

  it.each(["PENDING", "VERIFIED"] as const)(
    "%s firmada YASAL ÜNVAN değiştirilemez",
    async (status) => {
      const svc = makeService();
      const owner = await makeCompanyWithUser(prisma, {
        country: "TR",
        companyVerificationStatus: status,
      });
      await expect(
        svc.update(owner.company.id, {
          legalName: "Bambaşka Ünvan A.Ş.",
        } as never),
      ).rejects.toThrow(/ünvan, kimlik ve IBAN bilgileri değiştirilemez/);
    },
  );

  it("kilitli alan AYNI değerle gönderilirse istek geçer (form her kayıtta gönderiyor)", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "VERIFIED",
    });
    const before = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    // Ünvan değişmiyor, şehir değişiyor → kilit tetiklenmemeli.
    await svc.update(owner.company.id, {
      legalName: before.legalName ?? undefined,
      city: "Ankara",
    } as never);
    const after = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(after.city).toBe("Ankara");
  });

  it("kilitli firmada kimlik-DIŞI alanlar (hakkında) güncellenebilir", async () => {
    const svc = makeService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      companyVerificationStatus: "VERIFIED",
    });
    await svc.update(owner.company.id, { aboutText: "Merhaba" } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.aboutText).toBe("Merhaba");
  });
});

// Fix1/Fix2 — görsel URL host doğrulama + upload boyut. Zengin storage mock:
// assertOwnPublicImageUrl'in GERÇEK mantığı upload-validation.spec'te; burada
// update()'in orkestasyonu (grandfather: yalnız DEĞİŞEN değeri doğrular) + boyut.
function makeServiceEx(overrides: Record<string, unknown> = {}) {
  const storage = {
    generatePresignedPut: jest.fn(),
    generatePresignedGet: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    buildTenantProfilePrefix: (id: string) => `prod/tenant-profile/${id}/`,
    checkExists: jest.fn().mockResolvedValue({ exists: true, size: 1000 }),
    getPublicUrl: jest.fn((k: string) => `https://cdn/${k}`),
    resolveImageUrl: jest.fn(),
    // testte "kötü" = tenant-profile içermeyen / evil / data:
    assertOwnPublicImageUrl: jest.fn((v: string) => {
      if (
        v.startsWith("data:") ||
        v.startsWith("https://evil") ||
        !v.includes("tenant-profile/")
      ) {
        throw new BadRequestException("Görsel yalnız kendi profil deponuzdan olabilir");
      }
    }),
    ...overrides,
  };
  return {
    svc: new CompanyProfileService(
      prisma as never,
      storage as never,
      {} as never,
      new AuditService(prisma as never),
    ),
    storage,
  };
}

describe("company-profile — görsel URL host doğrulama (Fix1)", () => {
  it("harici URL PATCH → 400 (assertOwnPublicImageUrl kendi companyId ile çağrılır)", async () => {
    const { svc, storage } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    await expect(
      svc.update(owner.company.id, {
        logoUrl: "https://evil.com/x.jpg",
      } as never),
    ).rejects.toThrow(/kendi profil/);
    expect(storage.assertOwnPublicImageUrl).toHaveBeenCalledWith(
      "https://evil.com/x.jpg",
      owner.company.id,
    );
  });

  it("kendi R2 URL'i geçer + saklanır", async () => {
    const { svc } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const good = "https://cdn/prod/tenant-profile/x/logo.jpg";
    await svc.update(owner.company.id, { logoUrl: good } as never);
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.logoUrl).toBe(good);
  });

  it("GRANDFATHER: değişmeyen legacy değer YENİDEN doğrulanmaz (kırılmaz)", async () => {
    const { svc, storage } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    // Yeni kuralı GEÇMEYECEK legacy değer (tenant-profile yok) doğrudan DB'de.
    const legacy = "https://old-host.example/legacy-logo.png";
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { logoUrl: legacy },
    });
    // Aynı değeri tekrar gönder + alakasız alan → doğrulama ATLANIR (400 YOK).
    await svc.update(owner.company.id, {
      logoUrl: legacy,
      name: "Yeni Ad",
    } as never);
    expect(storage.assertOwnPublicImageUrl).not.toHaveBeenCalled();
    const c = await prisma.company.findUniqueOrThrow({
      where: { id: owner.company.id },
    });
    expect(c.name).toBe("Yeni Ad");
  });

  it("photos[]: yalnız YENİ eleman doğrulanır (eski korunur)", async () => {
    const { svc, storage } = makeServiceEx();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const old = "https://old/legacy-photo.jpg";
    await prisma.company.update({
      where: { id: owner.company.id },
      data: { photos: [old] },
    });
    const fresh = "https://cdn/prod/tenant-profile/x/photo.jpg";
    await svc.update(owner.company.id, { photos: [old, fresh] } as never);
    expect(storage.assertOwnPublicImageUrl).toHaveBeenCalledTimes(1);
    expect(storage.assertOwnPublicImageUrl).toHaveBeenCalledWith(
      fresh,
      owner.company.id,
    );
  });
});

describe("company-profile — resolveUploadedImage boyut (Fix2)", () => {
  it("10MB aşan → 400 + orphan silinir", async () => {
    const { svc, storage } = makeServiceEx({
      checkExists: jest
        .fn()
        .mockResolvedValue({ exists: true, size: 11 * 1024 * 1024 }),
    });
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const key = `prod/tenant-profile/${owner.company.id}/logo-x.jpg`;
    await expect(
      svc.resolveUploadedImage(owner.company.id, key),
    ).rejects.toThrow(/MB sınırını/);
    expect(storage.deleteObject).toHaveBeenCalledWith("public", key);
  });

  it("≤10MB → URL döner", async () => {
    const { svc } = makeServiceEx({
      checkExists: jest.fn().mockResolvedValue({ exists: true, size: 500 }),
    });
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const key = `prod/tenant-profile/${owner.company.id}/logo-x.jpg`;
    const res = await svc.resolveUploadedImage(owner.company.id, key);
    expect(res.url).toContain(key);
  });
});

describe("company-profile — görsel anahtarları benzersiz (2026-08-22)", () => {
  it("aynı firma logo için iki upload-url → FARKLI anahtar (object-lock 409 / önbellek sorunu kapanır)", async () => {
    const { svc } = makeServiceEx({
      buildTenantProfileKey: (tenant: string, kind: string, id: string, name: string) =>
        `prod/tenant-profile/${tenant}/${kind}-${id}-${name}`,
      generatePresignedPut: jest.fn().mockResolvedValue("https://r2/put"),
    } as never);
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a = await svc.requestImageUploadUrl(owner.company.id, "logo", "a.png", "image/png");
    const b = await svc.requestImageUploadUrl(owner.company.id, "logo", "a.png", "image/png");
    expect(a.key).not.toBe(b.key);
    for (const k of [a.key, b.key]) {
      expect(k.startsWith(`prod/tenant-profile/${owner.company.id}/logo-`)).toBe(true);
      expect(k).not.toContain(`logo-${owner.company.id}-`);
    }
  });
});
