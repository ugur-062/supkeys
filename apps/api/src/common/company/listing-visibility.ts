import { Prisma } from "@rothern/db";
import { tierAtLeast } from "@rothern/shared";

/**
 * İlan görünürlük kuralı — TEK KAYNAK (X5/X7 drift önleme). Bir izleyici bir
 * firmanın açık ihalesini ANCAK VE ANCAK şu durumda görür:
 *   - PUBLIC       → herkes
 *   - CONNECTIONS  → yalnız o firmayla AKTİF bağlı olan
 *   - PRIVATE      → yalnız o ilana DAVETLİ olan
 * Davet HER görünürlüğü açar (davetli, görünürlükten bağımsız görür). "Bağlı
 * olmak" ≠ "davetli olmak": bağlı firma PRIVATE (davet-only) ihaleyi GÖRMEZ.
 *
 * İki temsil, tek kural (drift'i önlemek için birlikte yaşarlar):
 *  - `isListingVisibleToViewer` — tekil (zaten çekilmiş) ilan → boolean (getOne).
 *  - `visibleOwnerListingWhere` — TEK firmanın ihaleleri üzerinde findMany → Prisma
 *    `where` fragment (getProfile).
 * (sellerTenders çok-firma + ülke-kapsamı bileşik varyantıdır; davet orada da
 * ülke/görünürlüğü aşar — aynı çekirdek kural.)
 */
export function isListingVisibleToViewer(
  visibility: string,
  opts: { isInvited: boolean; connectedToOwner: boolean },
): boolean {
  return (
    opts.isInvited ||
    visibility === "PUBLIC" ||
    (visibility === "CONNECTIONS" && opts.connectedToOwner)
  );
}

/**
 * Faz T — teklif-uygunluğu + maske TEK KAYNAK (üçüncü tanım yasak; getOne,
 * sellerTenders, placeBid, buyNow aynı formülü buradan okur):
 * - canBid: davet ∨ (CONNECTIONS ∧ bağlı) ∨ (PUBLIC ∧ (bağlı ∨ SILVER+)).
 * - masked: PUBLIC ∧ bağlı-değil ∧ davetsiz ∧ paket yok (STANDART) →
 *   freemium önizleme: liste/detay GÖRÜNÜR ama kısıtlı, teklif kapalı
 *   ("Silver+ gerekir" CTA'sı). Eski STANDARD maskeli-önizleme davranışının
 *   devamı — eşik PAKET→SILVER.
 */
export function listingBidEligibility(
  visibility: string,
  opts: {
    isInvited: boolean;
    connectedToOwner: boolean;
    viewerTier: string;
  },
): { canBid: boolean; masked: boolean } {
  const paid = tierAtLeast(opts.viewerTier, "SILVER");
  const canBid =
    opts.isInvited ||
    (visibility === "CONNECTIONS" && opts.connectedToOwner) ||
    (visibility === "PUBLIC" && (opts.connectedToOwner || paid));
  const masked =
    visibility === "PUBLIC" &&
    !opts.connectedToOwner &&
    !opts.isInvited &&
    !paid;
  return { canBid, masked };
}

export function visibleOwnerListingWhere(
  viewerCompanyId: string,
  connectedToOwner: boolean,
): Prisma.ListingWhereInput {
  return {
    OR: [
      { visibility: "PUBLIC" },
      ...(connectedToOwner
        ? [{ visibility: "CONNECTIONS" as const }]
        : []),
      // Davet → görünürlükten bağımsız (PRIVATE dahil) görür.
      { invitations: { some: { invitedCompanyId: viewerCompanyId } } },
    ],
  };
}

/**
 * PAZAR YERİ (giriş YAPMAMIŞ ziyaretçi) — iki ayrı kapı, ikisi de burada.
 *
 * Panel kuralları yukarıda izleyici kimliğine göre çalışır; burada izleyici
 * YOKTUR. O yüzden kapı tamamen ilanın ve sahibinin kendi bayraklarından
 * kurulur. İki kapıyı ayırmamızın sebebi iki farklı rızayı temsil etmeleri:
 *
 *   VİTRİN  → "platformun herkese açık sayfasında görünsün"
 *   İNDEKS  → "arama motoru kalıcı olarak dizinlesin"
 *
 * İkincisi geri alınması ZOR bir karardır (sayfa kaldırılsa bile düşme süresi
 * arama motorunun tarama sıklığına bağlı — Aracılık Sözleşmesi md. 2'de böyle
 * yazılı), bu yüzden daha dar tutulur.
 */

/** Yayımlanmış ve pazar yerinde gösterilebilir durumlar. */
const MARKETPLACE_STATUSES = [
  "OPEN",
  "IN_AWARD",
  "IN_AWARD_APPROVAL",
  "AWARDED",
  "CLOSED_NO_AWARD",
] as const;
// DIŞARIDA: DRAFT/IN_APPROVAL (yayımlanmadı), CANCELLED (iptal — gösterilecek
// bir şey kalmadı), CLOSED (yalnız ADMIN moderasyon kapatması; moderasyonla
// kapatılan ilanı vitrine koymak moderasyonu anlamsız kılar).

/**
 * Vitrin kapısı. `now` dışarıdan alınır ki sorgu ile testin saati aynı olsun.
 */
export function marketplaceListingWhere(now: Date): Prisma.ListingWhereInput {
  return {
    visibility: "PUBLIC",
    status: { in: [...MARKETPLACE_STATUSES] },
    publishedAt: { not: null },
    // Açılış embargosu: gelecek tarihli açılışta ilanı sahibi dışında kimse
    // göremez (bkz. bidsOpenAt). NOT(gt) NULL tuzağı: `bidsOpenAt: { lte: now }`
    // yazmak NULL satırları da ELERDİ — bu yüzden açık OR.
    OR: [{ bidsOpenAt: null }, { bidsOpenAt: { lte: now } }],
    company: {
      publicListingsEnabled: true,
      isActive: true,
      isBlocked: false,
    },
  };
}

/**
 * İndeks kapısı = vitrin ∧ ilan bazlı izin ∧ hâlâ teklife açık.
 *
 * `company.publicEnabled` BURADA YOK ve olmamalı: o bayrak firmanın PROFİL
 * sayfasını (`/firma/<slug>`) yönetir, ilan sayfası ise ilan sahibinin adını
 * hiç göstermez (bkz. `public-listing.projection.ts` "İLAN SAHİBİ ANONİM").
 * Kimliği açmayan bir sayfayı kimlik rızasına bağlamak, hiçbir şeyi korumadan
 * kapsamı daraltmak olurdu. Rıza zaten iki yerde alınıyor: firma düzeyinde
 * `publicListingsEnabled` (vitrin), ilan düzeyinde `publicIndexable`.
 *
 * Kapanmış ilan sitede DURUR ama `noindex` alır ve sitemap'ten düşer — süresi
 * geçmiş ilanı indekste tutmak hem ziyaretçiyi yanıltır hem de alan adının
 * güvenilirliğini aşağı çeker.
 */
export function marketplaceIndexableWhere(now: Date): Prisma.ListingWhereInput {
  return {
    ...marketplaceListingWhere(now),
    status: "OPEN",
    publicIndexable: true,
  };
}
