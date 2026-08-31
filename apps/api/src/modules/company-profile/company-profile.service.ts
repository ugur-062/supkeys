import {
  BadRequestException,
  ServiceUnavailableException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  generateSlug,
  isValidIbanTr,
  maskIban,
  normalizeIban,
} from "@rothern/shared";
import { effectiveTier } from "../../common/company/effective-tier";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  assertUploadedObjectValid,
  MAX_IMAGE_BYTES,
} from "../../common/helpers/upload-validation";
import { AuditService } from "../audit/audit.service";
import { CategoryService } from "../categories/services/category.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { StorageService } from "../storage/storage.service";
import { UpdateCompanyProfileDto } from "./dto/update-company-profile.dto";

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

const SELECT = {
  id: true,
  name: true,
  legalName: true,
  industry: true,
  website: true,
  country: true,
  city: true,
  district: true,
  addressLine: true,
  postalCode: true,
  aboutText: true,
  publicEnabled: true,
  logoUrl: true,
  coverImageUrl: true,
  linkedinUrl: true,
  instagramUrl: true,
  employeeCount: true,
  foundedYear: true,
  services: true,
  certifications: true,
  photos: true,
  certificateImages: true,
  buyerCategoryIds: true,
  sellerCategoryIds: true,
  taxNumber: true,
  taxOffice: true,
  companyType: true,
  authorizedTckn: true,
  authorizedTitle: true,
  mersisNo: true,
  tradeRegistryNo: true,
  kepAddress: true,
  iban: true,
  ibanHolder: true,
  billingPhone: true,
  billingPhoneVerifiedAt: true,
  rothernId: true,
  slug: true,
  tier: true,
  membershipEndAt: true, // INV-TIER-1: efektif tier hesabı için.
  companyVerificationStatus: true,
  onboardingCompletedAt: true,
} as const;

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly categories: CategoryService,
    private readonly audit: AuditService,
  ) {}

  /** Logo/kapak için presigned PUT URL üretir (tarayıcı doğrudan R2'ye yükler). */
  async requestImageUploadUrl(
    companyId: string,
    kind: "logo" | "cover" | "gallery",
    fileName: string,
    mimeType: string,
  ) {
    if (!IMAGE_MIME.includes(mimeType)) {
      throw new BadRequestException("Yalnızca JPEG, PNG veya WebP yüklenebilir");
    }
    // HER yükleme benzersiz anahtar (2026-08-22): logo/cover eskiden sabit
    // `<kind>-<companyId>` idi → (a) R2 bucket'ında object-lock/retention
    // politikası varken ikinci yazma 409 ObjectLockedByBucketPolicy (logo bir
    // daha DEĞİŞTİRİLEMİYORDU — canlıda doğrulandı), (b) aynı URL tarayıcı/CDN
    // önbelleğinde kalıp yeni görsel görünmüyordu. Eski nesne yetim kalır
    // (küçük; temizlik ayrı iş).
    const id = randomUUID();
    const key = this.storage.buildTenantProfileKey(
      companyId,
      kind,
      id,
      fileName,
    );
    const url = await this.storage.generatePresignedPut("public", key, mimeType);
    return { url, key };
  }

  /**
   * Yükleme bitince key → kalıcı public URL'e çevirir (DB'ye YAZMAZ — URL forma
   * konup diğer alanlarla birlikte Kaydet'te kalıcılaşır).
   */
  async resolveUploadedImage(companyId: string, key: string) {
    // IDOR koruması: istemci-verdiği key yalnız KENDİ firmasının tenant-profile
    // prefix'inde olabilir. Aksi halde başka firmanın (KYC/teklif dahil aynı
    // bucket) nesnesine presigned URL üretilebilirdi.
    if (!key.startsWith(this.storage.buildTenantProfilePrefix(companyId))) {
      throw new ForbiddenException("Bu görsel anahtarına erişim yetkiniz yok");
    }
    // Fix2: public bucket'ta OTORİTATİF varlık + boyut kontrolü (10MB) — diğer
    // 5 upload yolunun aksine burada eksikti → 5GB logo = bant/depolama DoS.
    // Aşan orphan silinir (presigned PUT boyut sınırlayamaz, register'da yakalanır).
    // GERÇEK içerik tipi de doğrulanır: presigned PUT content-type'ı imzalamaz,
    // public kovadaki HTML/SVG = cdn.rothern.com'da depolanmış XSS (P5 HIGH).
    await assertUploadedObjectValid(
      this.storage,
      "public",
      key,
      MAX_IMAGE_BYTES,
      IMAGE_MIME,
    );
    // Dalga B-5 (P5): eskiden CDN tabanı yoksa `resolveImageUrl` ile 15 DAKİKA
    // ömürlü bir PRESIGNED URL dönülüyordu — istemci onu `logoUrl` olarak
    // KALICI kaydediyor, çeyrek saat sonra görsel kalıcı olarak ölüyordu
    // (okuma yolu saklanan değeri ham döndürür, yeniden imzalamaz).
    // Public profil görseli CDN olmadan doğru çalışamaz → fail-closed.
    const url = this.storage.getPublicUrl(key);
    if (!url) {
      throw new ServiceUnavailableException(
        "Görsel yayınlama yapılandırması eksik (R2_PUBLIC_BASE_URL) — görsel yüklenemedi. Lütfen sistem yöneticinize bildirin.",
      );
    }
    return { url };
  }

  async get(companyId: string, canSeeSensitive = true) {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: SELECT,
    });
    if (!c) throw new NotFoundException("Firma bulunamadı");
    // INV-TIER-1: efektif tier — ham `tier` doğrudan dönmez (süre-dolma
    // penceresinde /me ile ıraksardı). membershipEndAt yalnız hesap içindi,
    // yanıttan çıkarılır.
    const { membershipEndAt, ...rest } = c;
    const base = { ...rest, tier: effectiveTier(c.tier, membershipEndAt) };
    // KVKK veri-minimizasyonu: yetkili TCKN + IBAN + fatura telefonu kişisel/
    // finansal veridir — yalnız company:manage yetkisi olan kullanıcıya döner.
    if (!canSeeSensitive) {
      return {
        ...base,
        authorizedTckn: null,
        // Banka-hesabı listesiyle AYNI kural (tek kaynak maskIban): tam IBAN
        // yerine maskeli referans — tanıma yeter, kopyalamaya yetmez.
        iban: c.iban ? maskIban(c.iban) : null,
        ibanHolder: null,
        billingPhone: null,
        // Şahıs firmasında taxNumber = 11 haneli TCKN (kişisel veri) → onu da
        // maskele. Tüzel kişide (JOINT_STOCK/LIMITED) vergi no kamuya açıktır.
        taxNumber:
          c.companyType === "SOLE_PROPRIETOR" ? null : c.taxNumber,
      };
    }
    return base;
  }

  /**
   * Düzenlenebilir profil alanları (yetki: company:manage / YONETICI).
   * INV-AUDIT-1: değişen alan ADLARI audit'e düşer (değerler değil; IBAN
   * yalnız maskeli referans). `actor` controller'dan gelir; audit fail-safe.
   */
  async update(
    companyId: string,
    dto: UpdateCompanyProfileDto,
    actor?: AuthenticatedCompanyUser,
  ) {
    // Fix1: SAKLANAN görsel URL'leri kendi R2 tenant-profile deposundan olmalı —
    // harici/data: URL PATCH'i public profilde <img src> olarak render edilir.
    // GRANDFATHER: yalnız DEĞİŞEN/YENİ değeri doğrula (mevcut değer dokunulmuyorsa
    // yeniden doğrulanmaz → env-prefix farkı olan legacy kayıtlar kırılmaz; saldırı
    // vektörü olan harici URL zaten YENİ değerdir → yakalanır).
    const touchesImages =
      dto.logoUrl !== undefined ||
      dto.coverImageUrl !== undefined ||
      dto.photos !== undefined ||
      dto.certificateImages !== undefined;
    if (touchesImages) {
      const cur = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          logoUrl: true,
          coverImageUrl: true,
          photos: true,
          certificateImages: true,
        },
      });
      const checkSingle = (incoming: string | undefined, current: string | null) => {
        const v = incoming?.trim();
        if (v && v !== current) this.storage.assertOwnPublicImageUrl(v, companyId);
      };
      const checkArray = (incoming: string[] | undefined, current: string[]) => {
        if (!incoming) return;
        const known = new Set(current);
        for (const raw of incoming) {
          const v = raw.trim();
          if (v && !known.has(v)) this.storage.assertOwnPublicImageUrl(v, companyId);
        }
      };
      checkSingle(dto.logoUrl, cur?.logoUrl ?? null);
      checkSingle(dto.coverImageUrl, cur?.coverImageUrl ?? null);
      checkArray(dto.photos, cur?.photos ?? []);
      checkArray(dto.certificateImages, cur?.certificateImages ?? []);
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.legalName !== undefined) data.legalName = dto.legalName.trim() || null;
    if (dto.industry !== undefined) data.industry = dto.industry.trim() || null;
    if (dto.website !== undefined) data.website = dto.website.trim() || null;
    if (dto.city !== undefined) data.city = dto.city.trim() || null;
    if (dto.district !== undefined) data.district = dto.district.trim() || null;
    if (dto.addressLine !== undefined)
      data.addressLine = dto.addressLine.trim() || null;
    if (dto.postalCode !== undefined)
      data.postalCode = dto.postalCode.trim() || null;
    if (dto.aboutText !== undefined)
      data.aboutText = dto.aboutText.trim() || null;
    if (dto.publicEnabled !== undefined) data.publicEnabled = dto.publicEnabled;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl.trim() || null;
    if (dto.coverImageUrl !== undefined)
      data.coverImageUrl = dto.coverImageUrl.trim() || null;
    if (dto.linkedinUrl !== undefined)
      data.linkedinUrl = dto.linkedinUrl.trim() || null;
    if (dto.instagramUrl !== undefined)
      data.instagramUrl = dto.instagramUrl.trim() || null;
    if (dto.employeeCount !== undefined)
      data.employeeCount = dto.employeeCount.trim() || null;
    if (dto.foundedYear !== undefined) data.foundedYear = dto.foundedYear ?? null;
    if (dto.services !== undefined)
      data.services = dto.services.map((s) => s.trim()).filter(Boolean);
    if (dto.certifications !== undefined)
      data.certifications = dto.certifications.map((s) => s.trim()).filter(Boolean);
    if (dto.photos !== undefined)
      data.photos = dto.photos.map((s) => s.trim()).filter(Boolean);
    if (dto.certificateImages !== undefined)
      data.certificateImages = dto.certificateImages
        .map((s) => s.trim())
        .filter(Boolean);
    // Ana kategori alanları SEGMENT (level 1) olmalı — eşleşme mantığı
    // (yayın bildirimi, keşfet, açık ihale sıralaması) bu dizileri segment
    // kodu varsayar; alt seviye yazılırsa firma eşleşme sinyalini sessizce
    // kaybediyordu (onboarding zaten L1 yazar, ayarlar UI'ı da artık öyle).
    if (dto.buyerCategoryIds !== undefined) {
      await this.categories.validateIds(dto.buyerCategoryIds, { exactLevel: 1 });
      data.buyerCategoryIds = dto.buyerCategoryIds;
    }
    if (dto.sellerCategoryIds !== undefined) {
      await this.categories.validateIds(dto.sellerCategoryIds, { exactLevel: 1 });
      data.sellerCategoryIds = dto.sellerCategoryIds;
    }

    // KYC KİMLİK KİLİDİ (2026-07-28): YASAL ÜNVAN / MERSİS / ticaret sicil /
    // IBAN, doğrulama dosyasının parçasıdır — inceleme başladıktan (PENDING)
    // veya onay verildikten (VERIFIED) sonra DEĞİŞTİRİLEMEZ. Doğrulama ekranı
    // bunları zaten kilitliyordu ama kilit YALNIZ arayüzdeydi; bu uç nokta
    // üzerinden (Ayarlar formu ya da doğrudan istek) baypas ediliyordu.
    //
    // "Gönderildi mi" DEĞİL "değişiyor mu" bakılır: Ayarlar formu yasal ünvanı
    // her kayıtta payload'a koyuyor, varlığa bakan bir kilit doğrulanmış
    // firmanın şehrini bile güncellemesini engellerdi. Gerçek ünvan değişikliği
    // (sicil tadili) belgelerle birlikte yeniden doğrulama ister.
    const LOCKED_KYC = ["legalName", "mersisNo", "tradeRegistryNo", "ibanHolder"] as const;
    const norm = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
    const kycBefore = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        companyVerificationStatus: true,
        legalName: true,
        mersisNo: true,
        tradeRegistryNo: true,
        iban: true,
        ibanHolder: true,
      },
    });
    const kycLocked =
      kycBefore?.companyVerificationStatus === "PENDING" ||
      kycBefore?.companyVerificationStatus === "VERIFIED";
    if (kycLocked && kycBefore) {
      const changed = LOCKED_KYC.some(
        (k) => dto[k] !== undefined && norm(dto[k]) !== norm(kycBefore[k]),
      );
      // IBAN ayrı: normalize edilmiş haliyle karşılaştırılır (boşluk/küçük harf
      // farkı "değişiklik" sayılmasın).
      const ibanChanged =
        dto.iban !== undefined &&
        (dto.iban.trim() ? normalizeIban(dto.iban) : null) !==
          (kycBefore.iban ?? null);
      if (changed || ibanChanged) {
        throw new BadRequestException(
          kycBefore.companyVerificationStatus === "PENDING"
            ? "Doğrulama inceleniyor; ünvan, kimlik ve IBAN bilgileri değiştirilemez"
            : "Firmanız doğrulandı; ünvan, kimlik ve IBAN bilgileri değiştirilemez — değişiklik için destek ile iletişime geçin",
        );
      }
    }

    // Kurumsal kimlik — düzenlenebilir kalemler (Faz 4).
    if (dto.mersisNo !== undefined) data.mersisNo = dto.mersisNo.trim() || null;
    if (dto.tradeRegistryNo !== undefined)
      data.tradeRegistryNo = dto.tradeRegistryNo.trim() || null;
    if (dto.ibanHolder !== undefined)
      data.ibanHolder = dto.ibanHolder.trim() || null;
    if (dto.kepAddress !== undefined) {
      const kep = dto.kepAddress.trim();
      if (kep && !/^[^@\s]+@[^@\s]+\.kep\.tr$/i.test(kep)) {
        throw new BadRequestException("Geçerli bir KEP adresi giriniz");
      }
      data.kepAddress = kep || null;
    }
    if (dto.iban !== undefined) {
      const raw = dto.iban.trim();
      if (raw) {
        const iban = normalizeIban(raw);
        // Banka hesaplarıyla aynı kural: TR katı; yabancı IBAN gevşek format
        // (yabancı firma profili TR-only kuralla IBAN kaydedemiyordu).
        const valid = iban.startsWith("TR")
          ? isValidIbanTr(iban)
          : /^[A-Z]{2}[0-9A-Z]{8,32}$/.test(iban);
        if (!valid) {
          throw new BadRequestException("Geçerli bir IBAN giriniz");
        }
        data.iban = iban;
      } else {
        data.iban = null;
      }
    }

    // Public profil açıksa ve henüz slug yoksa SEO-dostu benzersiz slug üret.
    const current = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true, publicEnabled: true },
    });
    const willBePublic =
      (data.publicEnabled as boolean | undefined) ??
      current?.publicEnabled ??
      false;
    if (willBePublic && !current?.slug) {
      const baseName =
        (data.name as string | undefined) ?? current?.name ?? "firma";
      data.slug = await this.ensureUniqueSlug(baseName, companyId);
    }

    const c = await this.prisma.company.update({
      where: { id: companyId },
      data,
      select: SELECT,
    });

    const changedFields = Object.keys(data);
    if (changedFields.length > 0) {
      const moneyPathChanged =
        changedFields.includes("iban") || changedFields.includes("ibanHolder");
      await this.audit.log({
        action: "company.profile.updated",
        actorType: "company",
        actorId: actor?.userId ?? null,
        actorEmail: actor?.email ?? null,
        tenantId: companyId,
        entityType: "company",
        entityId: companyId,
        metadata: {
          changedFields, // alan adları — değerler ASLA yazılmaz
          ...(changedFields.includes("iban")
            ? { ibanMaskedAfter: c.iban ? maskIban(c.iban) : null }
            : {}),
        },
        // IBAN/hesap-sahibi değişimi para-yolu delilidir → critical.
        critical: moneyPathChanged,
      });
    }
    return c;
  }

  private async ensureUniqueSlug(
    name: string,
    selfId: string,
  ): Promise<string> {
    const base = generateSlug(name).slice(0, 60) || "firma";
    let candidate = base;
    for (let i = 2; i < 50; i++) {
      const clash = await this.prisma.company.findFirst({
        where: { slug: candidate, id: { not: selfId } },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
