import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  requestPublicImageUpload,
  resolvePublicImage,
} from "../../common/company/public-image-upload";
import {
  BadRequestException,
  ServiceUnavailableException,
  ForbiddenException,
  Injectable,
  NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  MAX_COMPANY_SUB_CATEGORIES,
  MAX_COMPANY_SUB_PICKS,
  categoryAncestors,
  deepestCategoryPicks,
  isHiddenCategory,
  visibleCategoryIds,
  generateSlug,
  countryUsesIban,
  isValidAccountNumber,
  isMistypedIban,
  isValidIbanAny,
  isValidSwiftBic,
  normalizeSwift,
  maskIban,
  normalizeIban,
} from "@rothern/shared";
import { ensureUniqueCompanySlug } from "../../common/company/company-slug";
import { effectiveTier, isFreePeriod } from "../../common/company/effective-tier";
import { visibleTaxNumber } from "../../common/company/visible-tax-number";
import { resolveCityId, storedCityName } from "../../common/geo/geo-index";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  assertUploadedObjectValid,
  MAX_IMAGE_BYTES,
} from "../../common/helpers/upload-validation";
import { normalizeCategorySelection } from "../../common/helpers/category-selection.helper";
import { AuditService } from "../audit/audit.service";
import { assertPostalCode } from "../company-addresses/company-addresses.service";
import { assertWebsiteAddress } from "../../common/company/website-address";
import { SeoIndexService } from "../seo-index/seo-index.service";
import { ContentTranslationService } from "../content-translation/content-translation.service";
import { CategoryService } from "../categories/services/category.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { StorageService } from "../storage/storage.service";
import { UpdateCompanyProfileDto } from "./dto/update-company-profile.dto";

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

/** Süresi dolan paketin panelde "süre doldu / yenile" olarak gösterildiği gün sayısı (D-029). */
const MEMBERSHIP_EXPIRED_NOTICE_DAYS = 30;

const SELECT = {
  id: true,
  name: true,
  legalName: true,
  industry: true,
  activities: true,
  website: true,
  country: true,
  city: true,
  district: true,
  stateRegion: true,
  addressLine: true,
  postalCode: true,
  aboutText: true,
  publicEnabled: true,
  visitsVisible: true,
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
  buyerSubCategoryIds: true,
  sellerSubCategoryIds: true,
  sellerCategoryIds: true,
  taxNumber: true,
  taxOffice: true,
  companyType: true,
  legalFormLocal: true,
  cityId: true,
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

/**
 * The four declaration arrays AS SHOWN to the company itself: without the
 * codes under a hidden segment (owner rule 2026-10-09 - a hidden category is
 * shown to nobody, the declaring company included). A legacy code stays in
 * the record, and matching keeps reading it there, until the category
 * declaration is saved the next time (`update` drops it then). The settings
 * form is seeded from this answer, so it never sends a hidden code back.
 */
function withVisibleCategories<
  T extends {
    buyerCategoryIds: string[];
    buyerSubCategoryIds: string[];
    sellerCategoryIds: string[];
    sellerSubCategoryIds: string[];
  },
>(c: T): T {
  return {
    ...c,
    buyerCategoryIds: visibleCategoryIds(c.buyerCategoryIds),
    buyerSubCategoryIds: visibleCategoryIds(c.buyerSubCategoryIds),
    sellerCategoryIds: visibleCategoryIds(c.sellerCategoryIds),
    sellerSubCategoryIds: visibleCategoryIds(c.sellerSubCategoryIds),
  };
}

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly categories: CategoryService,
    private readonly audit: AuditService,
    /** Yayın anı SEO bildirimi — SONDA ve isteğe bağlı (test rig'leri kırılmasın). */
    @Optional() private readonly seo?: SeoIndexService,
    /** İçerik çevirisi (i18n Faz 1e): tanıtım/hizmet/sektör değişince çevrilir — SONDA ve isteğe bağlı. */
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  /**
   * Logo/kapak/galeri için presigned PUT URL. Mantık TEK KAYNAK
   * (`common/company/public-image-upload.ts`) — ürün görselleri de aynı
   * sertleştirmelerden geçsin diye oraya taşındı.
   */
  async requestImageUploadUrl(
    companyId: string,
    kind: "logo" | "cover" | "gallery",
    fileName: string,
    mimeType: string,
  ) {
    return requestPublicImageUpload(this.storage, companyId, kind, fileName, mimeType);
  }

  /**
   * Yükleme bitince key → kalıcı public URL (DB'ye YAZMAZ — URL forma konup
   * diğer alanlarla birlikte Kaydet'te kalıcılaşır).
   */
  async resolveUploadedImage(companyId: string, key: string) {
    return resolvePublicImage(this.storage, companyId, key);
  }

  async get(companyId: string, canSeeSensitive = true) {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: SELECT,
    });
    if (!c) throw new NotFoundException(i18nMessage("api.companyProfile.firmaBulunamadi"));
    // INV-TIER-1: efektif tier — ham `tier` doğrudan dönmez (süre-dolma
    // penceresinde /me ile ıraksardı). membershipEndAt yalnız hesap içindi,
    // yanıttan çıkarılır.
    const { membershipEndAt, ...rest } = c;
    const tier = effectiveTier(c.tier, membershipEndAt, c.companyVerificationStatus);
    const base = {
      ...withVisibleCategories(rest),
      tier,
      membership: await this.membershipStatus(companyId, c.tier, tier, membershipEndAt),
    };
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
        taxNumber: visibleTaxNumber(c),
      };
    }
    return base;
  }

  /**
   * ÜYELİK SÜRESİ (arayüz testi D-029): panel paketin ne zaman biteceğini ve
   * süresi dolduysa ne zaman dolduğunu gösterebilsin diye.
   *  · endsAt   — efektif paket hâlâ ücretliyse bitiş tarihi (süresizde null).
   *  · expiredAt — paket DÜŞTÜYSE (efektif STANDART) son 30 gün içindeki bitiş:
   *    cron öncesi tembel pencerede ham `membershipEndAt`; cron sonrası
   *    (`membershipEndAt` temizlenir) en son üyelik olayı EXPIRE ise onun
   *    `endBefore`'u. Sonradan GRANT/EXTEND/REVOKE geldiyse bant gösterilmez.
   */
  private async membershipStatus(
    companyId: string,
    rawTier: string,
    tier: string,
    membershipEndAt: Date | null,
  ): Promise<{ endsAt: Date | null; expiredAt: Date | null }> {
    // Ücretsiz dönem: üyelik süresi/bitiş bandı gösterilmez (paket yok —
    // doğrulama yeterli). Alan adları durur, değerler boş döner.
    if (isFreePeriod()) return { endsAt: null, expiredAt: null };
    if (tier !== "STANDART") return { endsAt: membershipEndAt, expiredAt: null };
    const windowStart = Date.now() - MEMBERSHIP_EXPIRED_NOTICE_DAYS * 86_400_000;
    if (rawTier !== "STANDART" && membershipEndAt) {
      return {
        endsAt: null,
        expiredAt: membershipEndAt.getTime() >= windowStart ? membershipEndAt : null,
      };
    }
    const last = await this.prisma.companyMembershipEvent.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { action: true, endBefore: true },
    });
    const expiredAt =
      last?.action === "EXPIRE" && last.endBefore && last.endBefore.getTime() >= windowStart
        ? last.endBefore
        : null;
    return { endsAt: null, expiredAt };
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
    // DTO `@Length(2, 200)` KIRPILMAMIŞ değere bakar; kayıt kırpılmış değeri
    // yazar → "   " boş ad olarak saklanıyordu (derin denetim LU-16).
    if (dto.name !== undefined && dto.name.trim().length < 2) {
      throw new BadRequestException(i18nMessage("api.companyProfile.firmaAdiEnAz2Karakter"));
    }
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
    if (dto.activities !== undefined) {
      // Yinelenen seçim tavanı boşa harcamasın (arayüz kutu işaretliyor ama
      // gövde elle de gelebilir).
      data.activities = [...new Set(dto.activities)];
    }
    if (dto.website !== undefined) data.website = dto.website.trim() || null;
    if (dto.city !== undefined) data.city = dto.city.trim() || null;
    if (dto.district !== undefined) data.district = dto.district.trim() || null;
    // Eyalet/bölge (TR dışı) — kayıtta sorulur, Firma Bilgileri'nden de
    // düzenlenir (2026-09-27; eskiden kayıttan sonra değiştirilemiyordu).
    if (dto.stateRegion !== undefined) data.stateRegion = dto.stateRegion.trim() || null;
    if (dto.addressLine !== undefined)
      data.addressLine = dto.addressLine.trim() || null;
    if (dto.postalCode !== undefined)
      data.postalCode = dto.postalCode.trim() || null;
    if (dto.aboutText !== undefined)
      data.aboutText = dto.aboutText.trim() || null;
    if (dto.publicEnabled !== undefined) data.publicEnabled = dto.publicEnabled;
    if (dto.visitsVisible !== undefined) data.visitsVisible = dto.visitsVisible;
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
    // ALT kategoriler: level 2-4 (family/class/commodity). Ana kategori
    // exactLevel:1 kalır — ikisi AYRI eksen, alt kategori ananın yerine
    // geçmez (eşleştirme her ikisine de `hasSome` ile bakar).
    // SEÇİM tavanı depolama tavanından AYRI: depoda ata zinciri de duruyor
    // (L2+L3+L4), kullanıcıya gösterilen sayı ise seçim sayısı. Kayıt yolundaki
    // `validateCategorySelection` ile AYNI kural — ayrışırlarsa ayarlardan
    // gönderilen beyan kayıttakinden geniş olabilirdi.
    const seciminiDenetle = (ids: string[]) => {
      if (deepestCategoryPicks(ids).length > MAX_COMPANY_SUB_PICKS) {
        throw new BadRequestException(
          i18nMessage("api.companyProfile.enFazlaUrunHizmetSecebilirsiniz", { MAXCOMPANYSUBPICKS: MAX_COMPANY_SUB_PICKS }),
        );
      }
    };
    // SUNUCU DA DEPOLAMA BİÇİMİNE GETİRİR (code-category-8): kayıt yoluyla aynı
    // dönüşüm (`normalizeCategorySelection`) — alt kodun ata zinciri alt
    // listeye, segmenti ana listeye. Eskiden yalnız tarayıcı yapıyordu; web
    // dışı istemci yaprağı zincirsiz, alt kodu segmenti ana listede olmadan
    // yazabiliyordu. Tavanlar ve doğrulama dönüşümden SONRAKİ listeye bakar.
    //
    // İstek ekseni KISMEN gönderebilir (form yalnız değişen alanı yollar) →
    // gelmeyen taraf kayıtlı değerden tamamlanır. Kayıtlı taraf yalnız dönüşüm
    // onu DEĞİŞTİRDİYSE yazılır ve yalnız EKLENEN kodları doğrulanır: isteğin
    // dokunmadığı eski kayıt bu yüzden reddedilmez.
    const kategoriyeDokunuyor =
      dto.buyerCategoryIds !== undefined ||
      dto.buyerSubCategoryIds !== undefined ||
      dto.sellerCategoryIds !== undefined ||
      dto.sellerSubCategoryIds !== undefined;
    if (kategoriyeDokunuyor) {
      const kayitli = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          buyerCategoryIds: true,
          buyerSubCategoryIds: true,
          sellerCategoryIds: true,
          sellerSubCategoryIds: true,
        },
      });
      // HIDDEN SEGMENTS - LEGACY DECLARATIONS (code-category-12, tightened by
      // the owner rule of 2026-10-09). A code that is ALREADY stored (and the
      // ancestors derived from it) is not rejected for being under a hidden
      // segment: the form sends the stored value back on every save, and that
      // used to block every other change. But it is not KEPT either: whenever
      // the category declaration is saved, hidden codes leave all four arrays
      // (they are shown nowhere, so nobody could remove them by hand). A NEW
      // hidden code is still rejected by `validateIds`.
      //
      // The exemption is PER AXIS (audit F25): a hidden code stored only on
      // the buying side is "new" on the selling side and is rejected there.
      // Until this change one set covered both axes, so such a code (and its
      // ancestors) could be copied from one axis to the other.
      const ayniListe = (a: readonly string[], b: readonly string[]) =>
        a.length === b.length && a.every((code, i) => code === b[i]);
      const ekseniIsle = async (
        mainKey: "buyerCategoryIds" | "sellerCategoryIds",
        subKey: "buyerSubCategoryIds" | "sellerSubCategoryIds",
      ) => {
        const gelenMain = dto[mainKey];
        const gelenSub = dto[subKey];
        const oncekiMain = kayitli?.[mainKey] ?? [];
        const oncekiSub = kayitli?.[subKey] ?? [];
        if (gelenMain === undefined && gelenSub === undefined) {
          // The request does not touch this axis: nothing is re-derived or
          // re-validated here; only its hidden legacy codes are dropped.
          const main = visibleCategoryIds(oncekiMain);
          const sub = visibleCategoryIds(oncekiSub);
          if (main.length !== oncekiMain.length) data[mainKey] = main;
          if (sub.length !== oncekiSub.length) data[subKey] = sub;
          return;
        }
        const buEksendeKayitli = new Set(
          [...oncekiMain, ...oncekiSub].flatMap((code) => [code, ...categoryAncestors(code)]),
        );
        const eskiGizlileriAt = (ids: readonly string[]) =>
          ids.filter((code) => !(isHiddenCategory(code) && buEksendeKayitli.has(code)));
        const { mainIds, subIds } = normalizeCategorySelection(
          eskiGizlileriAt(gelenMain ?? oncekiMain),
          eskiGizlileriAt(gelenSub ?? oncekiSub),
        );
        const mainYazilir = gelenMain !== undefined || !ayniListe(mainIds, oncekiMain);
        const subYazilir = gelenSub !== undefined || !ayniListe(subIds, oncekiSub);
        if (subYazilir) {
          if (subIds.length > MAX_COMPANY_SUB_CATEGORIES) {
            throw new BadRequestException(i18nMessage("api.helpers.altKategoriBeyaniFazlaGenis"));
          }
          seciminiDenetle(subIds);
          // No `allowHidden`: the stored hidden codes are already out of the
          // list, so every hidden code still here is a NEW one -> rejected.
          await this.categories.validateIds(
            gelenSub !== undefined ? subIds : subIds.filter((code) => !oncekiSub.includes(code)),
            { minLevel: 2 },
          );
          data[subKey] = subIds;
        }
        if (mainYazilir) {
          // DTO tavanı gelen listeye bakar; türeyen segmentlerle aşılabilir.
          if (mainIds.length > MAX_COMPANY_MAIN_CATEGORIES) {
            throw new BadRequestException(
              i18nMessage("api.helpers.n1ArasiAnaKategoriSecmelisiniz", { MAXCOMPANYMAINCATEGORIES: MAX_COMPANY_MAIN_CATEGORIES }),
            );
          }
          await this.categories.validateIds(
            gelenMain !== undefined ? mainIds : mainIds.filter((code) => !oncekiMain.includes(code)),
            { exactLevel: 1 },
          );
          data[mainKey] = mainIds;
        }
      };
      await ekseniIsle("buyerCategoryIds", "buyerSubCategoryIds");
      await ekseniIsle("sellerCategoryIds", "sellerSubCategoryIds");
    }

    // SIFIR KATEGORİ KAPISI — iki eksen BİRDEN boşalamaz.
    //
    // Kategori beyanı sistemdeki en yüklü sinyal: yeni PUBLIC alım talebi
    // yayınlandığında kimin haber alacağını `sellerCategoryIds`/
    // `sellerSubCategoryIds` belirliyor (`company-listings.service.ts`
    // `notifyCategoryMatchedCompanies`). Kategorisi olmayan firma dizinde
    // görünmeye devam eder ama HİÇBİR talep bildirimi almaz — ve bugüne kadar
    // bunun sebebini hiçbir ekranda göremiyordu. DTO'da `ArrayMinSize` yoktu,
    // yani boş dizi göndermek firmanın eşleşme sinyalini sessizce sıfırlıyordu.
    //
    // Kapı EKSEN BAZINDA değil TOPLAMDA: yalnız satan firma alış kategorisi
    // bırakmayabilir, yalnız alan firma satış kategorisi bırakmayabilir.
    // Zorunlu olan, ikisinden en az birinin dolu kalması.
    //
    // Yalnız kategori alanına DOKUNAN istek denetlenir. Varlığa bakan bir kapı,
    // bugün sıfır kategoriyle duran eski bir firmanın şehrini bile
    // güncellemesini engellerdi (KYC kilidinde öğrenilen ders).
    //
    // `data.*` counts too: a main list can be written without being in the
    // request. Dropping hidden legacy codes can EMPTY a main list from a
    // request that sent only the sub list or only the other axis; a company
    // must not be left without any category that way either.
    if (
      dto.buyerCategoryIds !== undefined ||
      dto.sellerCategoryIds !== undefined ||
      data.buyerCategoryIds !== undefined ||
      data.sellerCategoryIds !== undefined
    ) {
      const mevcut = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { buyerCategoryIds: true, sellerCategoryIds: true },
      });
      const alis =
        (data.buyerCategoryIds as string[] | undefined) ??
        mevcut?.buyerCategoryIds ??
        [];
      const satis =
        (data.sellerCategoryIds as string[] | undefined) ??
        mevcut?.sellerCategoryIds ??
        [];
      if (alis.length === 0 && satis.length === 0) {
        throw new BadRequestException(
          i18nMessage("api.companyProfile.enAzBirAnaKategoriSecili"),
        );
      }
    }

    // KYC KİMLİK KİLİDİ (2026-07-28): YASAL ÜNVAN / MERSİS / ticaret sicil /
    // IBAN, doğrulama dosyasının parçasıdır — inceleme başladıktan (PENDING)
    // veya onay verildikten (VERIFIED) sonra DEĞİŞTİRİLEMEZ. Doğrulama ekranı
    // bunları zaten kilitliyordu ama kilit YALNIZ arayüzdeydi; bu uç nokta
    // üzerinden (Ayarlar formu ya da doğrudan istek) baypas ediliyordu.
    //
    // FİRMA ADI da kilitte (2026-09-10, kullanıcı kararı): vitrinde
    // "Doğrulanmış" rozetiyle görünen ad serbest kalsaydı doğrulanmış hesap
    // başka bir markanın adını alabilirdi — rozet ada kefil olur.
    //
    // "Gönderildi mi" DEĞİL "değişiyor mu" bakılır: Ayarlar formu yasal ünvanı
    // her kayıtta payload'a koyuyor, varlığa bakan bir kilit doğrulanmış
    // firmanın şehrini bile güncellemesini engellerdi. Gerçek ünvan değişikliği
    // (sicil tadili) belgelerle birlikte yeniden doğrulama ister.
    const LOCKED_KYC = [
      "name",
      "legalName",
      "mersisNo",
      "tradeRegistryNo",
      "ibanHolder",
      "bankName",
    ] as const;
    const norm = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
    const kycBefore = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        companyVerificationStatus: true,
        name: true,
        legalName: true,
        mersisNo: true,
        tradeRegistryNo: true,
        iban: true,
        ibanHolder: true,
        bankSwiftBic: true,
        bankName: true,
        country: true,
        postalCode: true,
        website: true,
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
          (kycBefore.iban ? normalizeIban(kycBefore.iban) : null);
      // SWIFT de ödeme yolunu değiştirir → IBAN gibi kilitli.
      const swiftChanged =
        dto.bankSwiftBic !== undefined &&
        (normalizeSwift(dto.bankSwiftBic) || null) !== (kycBefore.bankSwiftBic ?? null);
      if (changed || ibanChanged || swiftChanged) {
        throw new BadRequestException(
          kycBefore.companyVerificationStatus === "PENDING"
            ? i18nMessage("api.companyProfile.dogrulamaInceleniyorKilitliAlanlar")
            : i18nMessage("api.companyProfile.firmanizDogrulandiKilitliAlanlar"),
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
        throw new BadRequestException(i18nMessage("api.companyProfile.gecerliBirKepAdresiGiriniz"));
      }
      data.kepAddress = kep || null;
    }
    if (dto.iban !== undefined) {
      const raw = dto.iban.trim();
      if (raw) {
        // Ülkeye göre (2026-09-27): IBAN ülkesinde IBAN (mod-97, TR katı);
        // IBAN kullanmayan ülkede bu alan HESAP NUMARASI taşır.
        if (countryUsesIban(kycBefore?.country ?? "TR")) {
          const iban = normalizeIban(raw);
          if (!isValidIbanAny(iban)) {
            throw new BadRequestException(i18nMessage("api.companyProfile.gecerliBirIbanGiriniz"));
          }
          data.iban = iban;
        } else {
          // IBAN biçiminde ama mod-97'si tutmayan değer hesap no sayılmaz
          // (yanlış yazılmış IBAN — derin denetim LU-10).
          if (isMistypedIban(raw)) {
            throw new BadRequestException(i18nMessage("api.bankDetails.ibanInvalid"));
          }
          if (!isValidAccountNumber(raw)) {
            throw new BadRequestException(i18nMessage("api.bankDetails.accountNumberInvalid"));
          }
          data.iban = raw;
        }
      } else {
        data.iban = null;
      }
    }
    if (dto.bankSwiftBic !== undefined) {
      const sw = normalizeSwift(dto.bankSwiftBic);
      if (sw && !isValidSwiftBic(sw)) {
        throw new BadRequestException(i18nMessage("api.bankDetails.swiftInvalid"));
      }
      data.bankSwiftBic = sw || null;
    }
    if (dto.bankName !== undefined) data.bankName = dto.bankName.trim() || null;
    // Merkez adresi posta kodu: adres defteriyle AYNI kural (TR'de 5 rakam).
    // Yalnız arayüz denetliyordu; PATCH 'ABCDE' kaydediyordu (arayüz testi
    // webC-09 yeniden doğrulama). Adres defteri gibi yalnız DEĞİŞEN değerde:
    // kuraldan önce kaydedilmiş hatalı kod başka alanın kaydını engellemesin.
    if (
      dto.postalCode !== undefined &&
      (dto.postalCode.trim() || null) !== (kycBefore?.postalCode ?? null)
    ) {
      assertPostalCode(kycBefore?.country ?? "TR", dto.postalCode);
    }
    // Web sitesi: kayıt (onboarding) ile AYNI kural — nokta taşıyan, boşluksuz
    // alan adı (arayüz testi signup-tr-5). Posta kodu gibi yalnız DEĞİŞEN
    // değerde: form kayıtlı değeri her kayıtta geri gönderir, kuraldan önce
    // kaydedilmiş hatalı adres başka alanın kaydını engellemesin. Boş = silme.
    if (
      dto.website !== undefined &&
      (dto.website.trim() || null) !== (kycBefore?.website ?? null)
    ) {
      assertWebsiteAddress(dto.website);
    }
    // Şehir → dünya şehir listesi kaydı (2026-09-27; şehir sayfası/süzgeç).
    if (dto.city !== undefined || dto.cityId !== undefined) {
      data.cityId = resolveCityId(kycBefore?.country ?? "TR", dto.city ?? null, dto.cityId);
      if (dto.city !== undefined && dto.city.trim()) data.city = storedCityName(data.cityId as number | null, dto.city);
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
      // Profil herkese açıksa (ya da az önce açıldı/kapandıysa) firma
      // sayfası + dizin + ürün sayfalarındaki satıcı bloğu tazelenir.
      if (current?.publicEnabled || c.publicEnabled) this.seo?.companyChanged(companyId);
      if (c.publicEnabled && (dto.aboutText !== undefined || dto.services !== undefined || dto.industry !== undefined)) {
        void this.translations?.enqueue("COMPANY", companyId);
      }
    }
    return withVisibleCategories(c);
  }

  /** Tek kaynak `common/company/company-slug.ts` — kayıt akışı da onu okur. */
  private ensureUniqueSlug(name: string, selfId: string): Promise<string> {
    return ensureUniqueCompanySlug(this.prisma, name, selfId);
  }
}
