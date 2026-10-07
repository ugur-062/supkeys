/**
 * ÜCRETSİZ (STANDART) VİTRİN — 2026-09-06 kullanıcı kararı "premium çekmek için".
 *
 * Görünmek ücretsiz, öne çıkmak paketli:
 *  - Standart firma profilini yayınlar, ürün vitrini açar, dizinde listelenir.
 *  - Paketin karşılığı: dizin/ürün sıralamasında öncelik, sınırsız ürün
 *    (`PRODUCT_LIMITS`), belge/video (`PRODUCT_MEDIA_TIER`).
 */
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { PRODUCT_LIMITS } from "@rothern/shared";
import { buildDirectory } from "../../src/common/company/company-directory";
import { enforceProductLimit } from "../../src/common/company/product-limit";
import { CompanyItemsController } from "../../src/modules/company-items/company-items.controller";
import { CompanyItemsService } from "../../src/modules/company-items/company-items.service";
import { CompanyPaidTierGuard } from "../../src/modules/company-auth/guards/company-paid-tier.guard";
import { PublicProfileService } from "../../src/modules/public-profile/public-profile.service";
import type { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { FREE_PERIOD } from "../../src/common/company/effective-tier";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

/**
 * ÜCRETSİZ DÖNEM (2026-10-07): SINIRLI firma = DOĞRULANMAMIŞ firma (saklı
 * kademesi STANDART → bugünkü ücretsiz sınırlar: ürün tavanı, belge/video yok).
 */
const makeLimited = () =>
  makeCompanyWithUser(prisma, { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" });
/**
 * TAM ERİŞİMLİ firma: doğrulanmış. Saklı kademesi STANDART olsa da JWT
 * stratejisi EFEKTİF kademeyi (GOLD) taşır — auth nesnesi onunla tutarlı.
 */
async function makeVerified() {
  const made = await makeCompanyWithUser(prisma, { tier: "STANDART" });
  return { ...made, auth: { ...made.auth, tier: "GOLD" as const } };
}

const items = () =>
  new CompanyItemsService(prisma as never, { log: jest.fn() } as never, {} as never);

let seq = 0;
/** Yayın kapısını geçen (ad/kategori/açıklama/görsel/anahtar kelime) TASLAK ürün. */
async function draftProduct(companyId: string, userId: string, over: Record<string, unknown> = {}) {
  seq += 1;
  return prisma.companyItem.create({
    data: {
      companyId,
      createdById: userId,
      name: `Ürün ${seq}`,
      unit: "adet",
      categoryId: "39121000",
      description: "y".repeat(120),
      images: ["a.webp"],
      keywords: ["pano"],
      isPublic: false,
      ...over,
    },
  });
}

async function listedCompany(
  tier: "STANDART" | "SILVER" | "GOLD",
  slug: string,
  companyVerificationStatus: "UNVERIFIED" | "VERIFIED" = "VERIFIED",
) {
  const made = await makeCompanyWithUser(prisma, { tier, companyVerificationStatus });
  await prisma.company.update({
    where: { id: made.company.id },
    data: { publicEnabled: true, slug, city: "İzmir" },
  });
  await draftProduct(made.company.id, made.user.id, {
    isPublic: true,
    publishedAt: new Date(),
    slug: `${slug}-urun`,
  });
  return made;
}

describe("ücretsiz vitrin — ürün tavanı ve medya", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("doğrulanmamış firma: yayında ürün tavanı PRODUCT_LIMITS'ten — tavan+1 403 (doğrulama ister, paket anmaz), taslak sınırsız; doğrulanmış firma limitsiz", async () => {
    const limit = PRODUCT_LIMITS.STANDART as number;
    // Sayı DEĞİL ilişki kilitlenir: tavan değişince test değişmeden yeşil kalır.
    expect(limit).toBeGreaterThan(0);
    const std = await makeLimited();
    const svc = items();
    for (let i = 0; i < limit; i += 1) {
      const d = await draftProduct(std.company.id, std.user.id);
      await svc.publish(std.auth, d.id);
    }
    const extra = await draftProduct(std.company.id, std.user.id);
    await expect(svc.publish(std.auth, extra.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.publish(std.auth, extra.id)).rejects.toThrow(
      new RegExp(`en fazla ${PRODUCT_LIMITS.STANDART} ürün`),
    );
    // Ücretsiz dönem: ret metni firma doğrulamasını söyler, paket adı anmaz.
    const denial = await svc.publish(std.auth, extra.id).catch((e: Error) => e.message);
    expect(denial).toMatch(/firmanızı doğrulayın/);
    expect(denial).not.toMatch(/silver|gold|paket/i);
    // Taslak kalır, silinmez. (Moderasyon: publish = onaya gönder → PENDING, isPublic false.)
    const extraRow = await prisma.companyItem.findUniqueOrThrow({ where: { id: extra.id } });
    expect(extraRow.isPublic).toBe(false);
    expect(extraRow.reviewStatus).toBe("DRAFT");
    // Kuyruktaki ürün yeniden gönderilemez — inceleme kilidi (409), tavan değil.
    const queued = await prisma.companyItem.findFirstOrThrow({ where: { companyId: std.company.id, reviewStatus: "PENDING" } });
    await expect(svc.publish(std.auth, queued.id)).rejects.toBeInstanceOf(ConflictException);
    // Admin onayladıktan sonra yayındaki ürünü yeniden göndermek tavana takılmaz (zaten yer tutuyor).
    await prisma.companyItem.update({ where: { id: queued.id }, data: { reviewStatus: "APPROVED", isPublic: true, publishedAt: new Date() } });
    await expect(svc.publish(std.auth, queued.id)).resolves.toBeTruthy();
    // Liste yanıtı tavanı taşır (web "N/tavan"). `pending` yayında olup yeniden
    // incelenenleri DE sayar (1 ürün iki sayaçta) — web bunu düşerek "yer
    // tutan" sayıyı bulur; burada aynı sayım DB'den: yayında ∪ onayda = tavan.
    const listed = await svc.list(std.company.id, { tier: std.auth.tier });
    expect(listed.productLimit).toBe(limit);
    expect(listed.counts.published).toBe(1);
    expect(listed.counts.pending).toBe(limit);
    const occupied = await prisma.companyItem.count({
      where: { companyId: std.company.id, isActive: true, OR: [{ isPublic: true }, { reviewStatus: "PENDING" }] },
    });
    expect(occupied).toBe(limit);

    // Doğrulanmış firma (saklı kademe STANDART olsa da) tavansız.
    const verified = await makeVerified();
    for (let i = 0; i < limit + 1; i += 1) {
      const d = await draftProduct(verified.company.id, verified.user.id);
      await svc.publish(verified.auth, d.id);
    }
    expect((await svc.list(verified.company.id, { tier: verified.auth.tier })).productLimit).toBeNull();
  });

  it("doğrulanmamış firma: belge ve video alanları DOKUNULMADAN kalır (yeni eklenemez, mevcut silinmez); doğrulanmış firma yazar", async () => {
    const svc = items();
    const std = await makeLimited();
    const p = await draftProduct(std.company.id, std.user.id, {
      documents: [{ url: "https://cdn.rothern.com/eski.pdf", title: "Eski katalog" }],
    });
    const saved = await svc.updateShowcase(std.auth, p.id, {
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      documents: [{ url: "https://cdn.rothern.com/yeni.pdf", title: "Yeni" }],
    });
    expect(saved.videoUrl).toBeNull();
    expect(saved.documents).toEqual([{ url: "https://cdn.rothern.com/eski.pdf", title: "Eski katalog" }]);

    const silver = await makeVerified();
    const q = await draftProduct(silver.company.id, silver.user.id);
    const ok = await svc.updateShowcase(silver.auth, q.id, {
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      documents: [{ url: "https://cdn.rothern.com/yeni.pdf", title: "Yeni" }],
    });
    expect(ok.videoUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(ok.documents).toEqual([{ url: "https://cdn.rothern.com/yeni.pdf", title: "Yeni" }]);
  });

  it("video izinli listesi ve https kuralı YALNIZ DEĞİŞEN değerde (Y-11 gözden geçirme): eski değer kaydı düşürmez", async () => {
    const svc = items();
    const read = (id: string) => prisma.companyItem.findUniqueOrThrow({ where: { id } });
    const silver = await makeVerified();
    // Kural öncesinden kalmış değerler (izinli liste dışı video, http bağlantı).
    const p = await draftProduct(silver.company.id, silver.user.id, {
      videoUrl: "https://www.dailymotion.com/video/x8abc",
      externalUrl: "http://firma.com/urun",
    });
    // Form iki alanı da AYNEN geri gönderir; başka alan değişir → kayıt geçer.
    await svc.updateShowcase(silver.auth, p.id, {
      videoUrl: "https://www.dailymotion.com/video/x8abc",
      externalUrl: "http://firma.com/urun",
      description: "z".repeat(120),
    });
    expect(await read(p.id)).toMatchObject({
      description: "z".repeat(120),
      videoUrl: "https://www.dailymotion.com/video/x8abc",
      externalUrl: "http://firma.com/urun",
    });
    // YENİ geçersiz değer reddedilir.
    for (const patch of [
      { videoUrl: "https://example.com/video.mp4" },
      { videoUrl: "javascript:alert(1)" },
      { externalUrl: "javascript:alert(1)" },
      { externalUrl: "ftp://firma.com" },
    ]) {
      await expect(svc.updateShowcase(silver.auth, p.id, patch)).rejects.toBeInstanceOf(BadRequestException);
    }
    // Geçerli yeni değer yazılır, boş metin temizler.
    await svc.updateShowcase(silver.auth, p.id, { videoUrl: "https://vimeo.com/76979871", externalUrl: "" });
    expect(await read(p.id)).toMatchObject({ videoUrl: "https://vimeo.com/76979871", externalUrl: null });

    // Sınırlı (doğrulanmamış) satıcı: video alanı formda gizli ve yazılmaz —
    // gizli eski değer de gönderilen değer de denetlenmez, kayıt geçer.
    const std = await makeLimited();
    const q = await draftProduct(std.company.id, std.user.id, { videoUrl: "www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await svc.updateShowcase(std.auth, q.id, { videoUrl: "javascript:alert(1)", description: "w".repeat(120) });
    expect(await read(q.id)).toMatchObject({
      description: "w".repeat(120),
      videoUrl: "www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    // Yeni ürün de aynı kuraldan geçer — kayıt AÇILMADAN (yetim taslak yok).
    await expect(
      svc.createProduct(silver.auth, { name: "Videolu", videoUrl: "https://example.com/v.mp4" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.companyItem.count({ where: { companyId: silver.company.id, name: "Videolu" } })).toBe(0);
  });

  it("belge yükleme uçları paket kapılı (CompanyPaidTierGuard metadata'sı)", () => {
    for (const handler of ["documentUploadUrl", "documentResolve"] as const) {
      const guards = (Reflect.getMetadata("__guards__", CompanyItemsController.prototype[handler]) ?? []) as unknown[];
      expect(guards).toContain(CompanyPaidTierGuard);
    }
    // Görsel yükleme her pakete açık — ürün görseli yayın kapısının parçası.
    const imageGuards = (Reflect.getMetadata("__guards__", CompanyItemsController.prototype.imageUploadUrl) ?? []) as unknown[];
    expect(imageGuards).not.toContain(CompanyPaidTierGuard);
  });
});

describe("ücretsiz vitrin — profil, dizin ve sıra", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("STANDART firmanın herkese açık profili 200 döner ve doğrulanmamış işaretlenir", async () => {
    // Fabrika varsayılanı VERIFIED — ücretsiz firma tipik olarak doğrulanmamış.
    const std = await listedCompany("STANDART", "ucretsiz-sanayi", "UNVERIFIED");
    const svc = new PublicProfileService(prisma as unknown as PrismaBypassService);
    const prof = await svc.getBySlug("ucretsiz-sanayi");
    expect(prof.name).toBe(std.company.name);
    expect(prof.verified).toBe(false);
  });

  it("dizin: doğrulanmamış (sınırlı) firma listelenir ama DOĞRULANMIŞ firma daha yeni olmasa da ÖNCE gelir", async () => {
    const free = await listedCompany("STANDART", "free-co", "UNVERIFIED");
    // Saklı kademe STANDART — önceliği yalnız doğrulama veriyor (ücretsiz dönem).
    await listedCompany("STANDART", "paid-co");
    // Sınırlı firma en son güncellenen olsun — yine de tam erişimli önde.
    await prisma.company.update({ where: { id: free.company.id }, data: { industry: "Güncel" } });
    const dir = await buildDirectory(prisma, {});
    expect(dir.items.map((c) => c.slug)).toEqual(["paid-co", "free-co"]);
  });

  it("dizin: doğrulanmamış firmanın süresi DOLMUŞ saklı paketi ücretsiz gibi sıralanır (INV-TIER-1) — ama listede kalır", async () => {
    const expired = await listedCompany("GOLD", "expired-co", "UNVERIFIED");
    await prisma.company.update({
      where: { id: expired.company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    // Süresi dolmamış saklı paket doğrulanmamış firmada da geçerli (kimse erişim yitirmez).
    const live = await listedCompany("SILVER", "live-co", "UNVERIFIED");
    await prisma.company.update({
      where: { id: live.company.id },
      data: { membershipEndAt: new Date(Date.now() + 86_400_000) },
    });
    await prisma.company.update({ where: { id: expired.company.id }, data: { industry: "Güncel" } });
    const dir = await buildDirectory(prisma, {});
    expect(dir.items.map((c) => c.slug)).toEqual(["live-co", "expired-co"]);
  });

  it("dizin: DOĞRULANMIŞ firmanın saklı paketinin süresi dolsa da önceliği sürer (ücretsiz dönem)", async () => {
    const expired = await listedCompany("GOLD", "expired-verified-co");
    await prisma.company.update({
      where: { id: expired.company.id },
      data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
    });
    const free = await listedCompany("STANDART", "free-co", "UNVERIFIED");
    await prisma.company.update({ where: { id: free.company.id }, data: { industry: "Güncel" } });
    const dir = await buildDirectory(prisma, {});
    expect(dir.items.map((c) => c.slug)).toEqual(["expired-verified-co", "free-co"]);
  });

  describe("saklı paket sırası (ücretsiz dönem anahtarı KAPALI)", () => {
    // Paket önceliği ve süre kuralı doğrulanmış firmaya yalnız anahtar kapalıyken işler; ücretli paketler dönünce aynen çalışmalı.
    beforeEach(() => {
      jest.replaceProperty(FREE_PERIOD, "VERIFIED_HAS_FULL_ACCESS", false);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("dizin: ücretsiz firma listelenir ama PAKETLİ firma daha yeni olmasa da ÖNCE gelir", async () => {
      const free = await listedCompany("STANDART", "free-co");
      await listedCompany("SILVER", "paid-co");
      // Ücretsiz firma en son güncellenen olsun — yine de paketli önde.
      await prisma.company.update({ where: { id: free.company.id }, data: { industry: "Güncel" } });
      const dir = await buildDirectory(prisma, {});
      expect(dir.items.map((c) => c.slug)).toEqual(["paid-co", "free-co"]);
    });

    it("dizin: süresi DOLMUŞ paket ücretsiz gibi sıralanır (INV-TIER-1) — ama listede kalır", async () => {
      const expired = await listedCompany("GOLD", "expired-co");
      await prisma.company.update({
        where: { id: expired.company.id },
        data: { membershipEndAt: new Date(Date.now() - 86_400_000) },
      });
      await listedCompany("SILVER", "live-co");
      await prisma.company.update({ where: { id: expired.company.id }, data: { industry: "Güncel" } });
      const dir = await buildDirectory(prisma, {});
      expect(dir.items.map((c) => c.slug)).toEqual(["live-co", "expired-co"]);
    });
  });
});

describe("ücretsiz vitrin — tavan atlatma ve kademe düşüşü (denetim 2026-09-06)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("arşivden GERİ ALMA tavanı denetler: tavan kadar yayında + arşivli public ürün → 403; biri vitrinden çekilince geri alınır", async () => {
    const std = await makeLimited();
    const svc = items();
    for (let i = 0; i < PRODUCT_LIMITS.STANDART!; i += 1) {
      const d = await draftProduct(std.company.id, std.user.id);
      await svc.publish(std.auth, d.id);
    }
    const archived = await draftProduct(std.company.id, std.user.id, {
      isPublic: true,
      publishedAt: new Date(),
      slug: "arsivli-public",
      isActive: false,
    });
    // Tavan yayında + ONAYDA (publish kapısıyla aynı sayım): kuyruktakiler + arşivden dönen public → 403.
    await expect(svc.setActive(std.auth, archived.id, true)).rejects.toBeInstanceOf(ForbiddenException);
    const first = await prisma.companyItem.findFirstOrThrow({ where: { companyId: std.company.id, isActive: true, reviewStatus: "PENDING" } });
    await svc.unpublish(std.auth, first.id); // kuyruktan düşer → taslak
    await expect(svc.setActive(std.auth, archived.id, true)).resolves.toBeTruthy();
    const occupied = await prisma.companyItem.count({
      where: { companyId: std.company.id, isActive: true, OR: [{ isPublic: true }, { reviewStatus: "PENDING" }] },
    });
    expect(occupied).toBe(PRODUCT_LIMITS.STANDART);
  });

  it("enforceProductLimit: STANDART'a düşen firmada tavan kadar ürün kalır, kalanı TASLAĞA çekilir (silinmez); paketli kademede dokunulmaz", async () => {
    const co = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const ids: string[] = [];
    const tavan = PRODUCT_LIMITS.STANDART!;
    for (let i = 0; i < tavan + 2; i += 1) {
      const d = await draftProduct(co.company.id, co.user.id, {
        isPublic: true,
        publishedAt: new Date(Date.now() - i * 1000),
        slug: `urun-${i}`,
        completionScore: 100 - i,
      });
      ids.push(d.id);
    }
    expect(await enforceProductLimit(prisma, co.company.id, "SILVER")).toMatchObject({ unpublished: 0 });
    const r = await enforceProductLimit(prisma, co.company.id, "STANDART");
    expect(r).toMatchObject({ unpublished: 2, kept: tavan, limit: tavan });
    const stillPublic = await prisma.companyItem.findMany({ where: { companyId: co.company.id, isPublic: true }, select: { id: true } });
    expect(stillPublic.map((x) => x.id).sort()).toEqual(ids.slice(0, tavan).sort());
    // Düşenler silinmedi, slug korunur.
    const dropped = await prisma.companyItem.findMany({ where: { id: { in: ids.slice(tavan) } }, select: { isPublic: true, slug: true, isActive: true } });
    expect(dropped).toHaveLength(2);
    expect(dropped.every((d) => !d.isPublic && d.isActive && d.slug)).toBe(true);
  });

  it("enforceProductLimit: ONAY BEKLEYEN ürünler de tavana sayılır; tavan dışındaki bekleyen inceleme TASLAĞA düşer (derin denetim MU-13)", async () => {
    const co = await makeCompanyWithUser(prisma, { tier: "SILVER" });
    const tavan = PRODUCT_LIMITS.STANDART!;
    const yayinda = tavan - 2;
    const publicIds: string[] = [];
    for (let i = 0; i < yayinda; i += 1) {
      const d = await draftProduct(co.company.id, co.user.id, {
        isPublic: true,
        reviewStatus: "APPROVED",
        publishedAt: new Date(Date.now() - i * 1000),
        slug: `pub-${i}`,
        completionScore: 10,
      });
      publicIds.push(d.id);
    }
    // Vitrindeki bir ürünün güncellemesi incelemede ("yayında·incelemede").
    await prisma.companyItem.update({ where: { id: publicIds[0] }, data: { reviewStatus: "PENDING", submittedAt: new Date() } });
    // Kuyrukta 5 ürün (vitrinde değil) — skoru yüksek olsa da yayındakiler önce tutulur.
    const pendingIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const d = await draftProduct(co.company.id, co.user.id, {
        reviewStatus: "PENDING",
        submittedAt: new Date(),
        slug: `pend-${i}`,
        completionScore: 100 - i,
      });
      pendingIds.push(d.id);
    }
    const r = await enforceProductLimit(prisma, co.company.id, "STANDART");
    expect(r).toMatchObject({ unpublished: 3, kept: tavan, limit: tavan });
    // Yayındakilerin hepsi kaldı, kuyruktan en iyi 2 ürün kaldı.
    const pub = await prisma.companyItem.count({ where: { id: { in: publicIds }, isPublic: true } });
    expect(pub).toBe(yayinda);
    const kept = await prisma.companyItem.findMany({ where: { id: { in: pendingIds }, reviewStatus: "PENDING" }, select: { id: true } });
    expect(kept.map((x) => x.id).sort()).toEqual(pendingIds.slice(0, 2).sort());
    const dropped = await prisma.companyItem.findMany({
      where: { id: { in: pendingIds.slice(2) } },
      select: { isPublic: true, reviewStatus: true, submittedAt: true, slug: true },
    });
    expect(dropped.every((d) => !d.isPublic && d.reviewStatus === "DRAFT" && d.submittedAt === null && d.slug)).toBe(true);
    const occupied = await prisma.companyItem.count({
      where: { companyId: co.company.id, isActive: true, OR: [{ isPublic: true }, { reviewStatus: "PENDING" }] },
    });
    expect(occupied).toBe(tavan);
  });
});
