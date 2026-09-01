"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { PaymentCategoryValue } from "@/lib/tenders/form-schema";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

/**
 * İlan değişince etkilenen TÜM görünümleri tazele. "company-listings" öneki
 * mine/detail/browse'ı kapsar ama İhalelerim ayrı bir kök ("company-tenders")
 * kullandığından onu da açıkça geçersiz kılmak gerekir (aksi halde liste
 * staleTime=60sn boyunca eski kalır).
 */
function invalidateListingCaches(
  qc: QueryClient,
  opts?: { orders?: boolean; myBids?: boolean },
) {
  qc.invalidateQueries({ queryKey: ["company-listings"] });
  qc.invalidateQueries({ queryKey: ["company-tenders"] });
  if (opts?.orders) qc.invalidateQueries({ queryKey: ["company-orders"] });
  if (opts?.myBids) qc.invalidateQueries({ queryKey: ["company-my-bids"] });
  // Denetim 2026-08-26 Parça 10: pano HİÇBİR mutasyonla tazelenmiyordu
  // (repoda `company-dashboard` invalidasyonu yoktu) ve analitik sorguların
  // staleTime'ı 5 dk → yayınlanan ihale/kazandırma panoda dakikalarca
  // görünmüyordu. İlan durumunu değiştiren her yol panoyu da tazeler.
  qc.invalidateQueries({ queryKey: ["company-dashboard"] });
}

/**
 * Durum değiştiren sahip aksiyonları için ANINDA tazeleme (yeni-tur deseni):
 * invalidate/sinyal yoluna güvenme — geçiş anında invalidation çığı istekleri
 * kuyruklatıp iptal zincirine sokuyor, taze cevap uzun süre uygulanmayabiliyor.
 * Detayı TEK doğrudan istekle çek ve cache'e YAZ; onSuccess'ten döndürülen bu
 * promise bitmeden mutateAsync çözülmez → buton pending'i taze arayüz ekrana
 * gelene dek sürer, bayat durum hiç görünmez.
 */
async function refreshListingDetail(qc: QueryClient, id: string) {
  const { data } = await companyApi.get<ListingDetail>(
    `/company/listings/${id}`,
  );
  qc.setQueryData(["company-listings", "detail", id], data);
  invalidateListingCaches(qc);
}

export type ListingType = "ALIM" | "SATIS";
export type ListingFormat = "RFQ" | "ENGLISH_AUCTION";
export type ListingVisibility = "PUBLIC" | "CONNECTIONS" | "PRIVATE";
export type ListingStatus =
  | "DRAFT"
  | "IN_APPROVAL"
  | "OPEN"
  | "CLOSED"
  | "IN_AWARD"
  | "IN_AWARD_APPROVAL"
  | "AWARDED"
  | "CLOSED_NO_AWARD"
  | "CANCELLED";

export interface Listing {
  id: string;
  number: string | null;
  type: ListingType;
  isInternational: boolean;
  format: ListingFormat | null;
  minPrice: string | null;
  buyNowPrice: string | null;
  visibility: ListingVisibility;
  title: string;
  description: string | null;
  status: ListingStatus;
  closesAt: string | null;
  createdAt: string;
}

// Backend Prisma `Currency` enum'u ile birebir (9 birim) — eksik tutmak
// AED/CNY tekliflerini `as` cast'leriyle maskeleyip sessiz hataya yol açıyordu.
export type CurrencyCode =
  | "TRY"
  | "USD"
  | "EUR"
  | "GBP"
  | "CHF"
  | "JPY"
  | "AED"
  | "CNY"
  | "RUB";

export interface ItemQuestionInput {
  text: string;
  answerType: "TEXT" | "NUMBER" | "YES_NO" | "DATE";
  required?: boolean;
}

export interface ListingItemInput {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  targetPrice?: number;
  /** SATIS + KALEM fiyatlandırma. */
  minUnitPrice?: number;
  buyNowUnitPrice?: number;
  materialCode?: string;
  requiredByDate?: string;
  questions?: ItemQuestionInput[];
}

export interface CreateListingInput {
  type: ListingType;
  asDraft?: boolean; // true → taslak kaydet, yayınlama
  isInternational: boolean;
  targetCountries?: string[]; // sınır ötesi hedef ülkeler (boş = tümü)
  deliveryAddressId?: string;
  billingAddressId?: string;
  format?: ListingFormat; // ALIM
  priceScope?: "TOPLU" | "KALEM"; // SATIS fiyatlandırma kapsamı
  minPrice?: number; // SATIS
  buyNowPrice?: number; // SATIS
  visibility: ListingVisibility;
  title: string;
  description?: string;
  closesAt?: string;
  bidsOpenAt?: string;
  // İhale (ALIM) zenginleştirme
  items?: ListingItemInput[];
  invitations?: string[]; // davet edilen rothernId'ler
  categoryIds?: string[]; // UNGM UNSPSC TR kategori kodları
  keywords?: string[];
  terms?: string;
  internalNotes?: string;
  requireAllItems?: boolean;
  requireBidDocument?: boolean;
  showTargetToSuppliers?: boolean;
  isSealedBid?: boolean;
  primaryCurrency?: CurrencyCode;
  allowedCurrencies?: CurrencyCode[];
  // Teslim / ödeme — zamanlama GÖNDERİLMEZ, backend plandan türetir (Faz 2).
  deliveryTerm?: string;
  paymentCategory?: PaymentCategoryValue;
  advancePercent?: number;
  paymentDays?: number;
  lcType?: "SIGHT" | "USANCE";
  lcConfirmed?: boolean;
  paymentNote?: string;
  /** Peşin ödemede satıcıdan teminat mektubu istensin mi (opsiyonel). */
  requireGuaranteeLetter?: boolean;
  // Lojistik
  isLogistics?: boolean;
  logistics?: Record<string, unknown>;
  // İngiliz Usulü açık eksiltme (minimum pay kaldırıldı 2026-07-13)
  bidVisibility?: string;
  decimalPlaces?: number;
  sendClosingReminder?: boolean;
  reminderMinutesBefore?: number;
  autoExtendOnLateBid?: boolean;
  autoExtendThresholdMin?: number;
  autoExtendByMinutes?: number;
}

// Dalga B-4: `useMyListings` KALDIRILDI — hiçbir yerden çağrılmıyordu
// (ölü kod). Gerekirse git geçmişinden geri alınabilir.
export interface MyBid {
  id: string;
  amount: string;
  currency: CurrencyCode;
  /** TRY karşılığı (kur snapshot'ı) — çoklu birimde adil sıralama/kıyas. */
  amountTry: string | null;
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "WITHDRAWN"
    | "WON"
    | "AWARDED_PARTIAL"
    | "LOST";
  round: number;
  version: number;
  isBuyNow: boolean;
  createdAt: string;
  /** ALIM: taahhüt edilen teslim; SATIS: istenen teslim tarihi (LEGACY). */
  deliveryDate: string | null;
  /** Teslim SÜRESİ (BID_DELIVERY_TIMES; 2026-08-02 sonrası teklifler). */
  deliveryTime?: string | null;
  /** Kazanan teklifin oluşturduğu sipariş (WON/AWARDED_PARTIAL). */
  orderId: string | null;
  listing: {
    id: string;
    number: string | null;
    title: string;
    type: ListingType;
    status: ListingStatus;
    closesAt: string | null;
    /** İlan sahibi (ALIM'da alıcı, SATIS'ta satıcı) firma adı. */
    ownerName: string;
  };
}

/** Firmanın verdiği tüm teklifler — Tekliflerim ekranı. */
export function useMyBids() {
  return useQuery({
    queryKey: ["company-my-bids"],
    queryFn: async () => {
      const { data } = await companyApi.get<MyBid[]>(
        "/company/listings/my-bids",
      );
      return data;
    },
    // Eleme/kazanma gibi durum değişiklikleri yenilemeden görünsün.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

// NOT: useBrowseListings/BrowseListing kaldırıldı (2026-07-03) — backend
// browse endpoint'i söküldü; liste kaynağı useSellerTenders.

export interface ListingItemQuestionRow {
  id: string;
  text: string;
  answerType: "TEXT" | "NUMBER" | "YES_NO" | "DATE";
  required: boolean;
}

export interface ListingItemRow {
  id: string;
  lineNo: number;
  name: string;
  description: string | null;
  quantity: string;
  unit: string;
  /** Faz 1: kanonik birim kodu; eski kayıtlarda null. */
  unitCode?: string | null;
  // Faz 3 — kalem detayları (maskeli görünümde bazıları null döner).
  brand?: string | null;
  mpn?: string | null;
  alternativeAllowed?: boolean;
  specification?: string | null;
  warrantyMonths?: number | null;
  hsCode?: string | null;
  targetPrice: string | null;
  /** SATIS + KALEM fiyatlandırma. */
  minUnitPrice?: string | null;
  buyNowUnitPrice?: string | null;
  materialCode?: string | null;
  requiredByDate?: string | null;
  questions?: ListingItemQuestionRow[];
}

export interface ListingBidItemRow {
  itemId: string;
  unitPrice: string;
  deliveryDate?: string | null;
  /** Kalem teslim SÜRESİ (BID_DELIVERY_TIMES). */
  deliveryTime?: string | null;
  /** Kalem para birimi (madde 9; null = teklifin ana birimi). */
  currency?: string | null;
  // Faz 3 — MUADİL beyanı: alıcı izin verdiyse tedarikçi NE teklif ettiğini
  // söyler; olmadan alıcı tekliflerin aynı ürüne mi ait olduğunu göremez.
  isAlternative?: boolean;
  offeredBrand?: string | null;
  offeredMpn?: string | null;
}

/** SATIS teklifinde alıcının teslimat adresi (satıcıya gösterilir). */
export interface BidDeliveryAddress {
  title: string;
  contactName: string | null;
  phone: string | null;
  country: string;
  city: string | null;
  district: string | null;
  addressLine: string;
  postalCode: string | null;
}

export interface ListingBidRow {
  id: string;
  bidderName: string;
  /**
   * Teklif verenin belge doğrulaması tamam mı. Davetli/bağlantılı firma
   * doğrulanmadan teklif verebildiği için alıcı bunu kazandırmadan önce
   * görmeli. Eski yanıtlarda alan yok → `undefined` (rozet çizilmez).
   */
  bidderVerified?: boolean;
  bidderCompanyId?: string;
  amount: string;
  currency?: string;
  version?: number;
  exchangeRateSnapshot?: string | null;
  amountTry?: string | null;
  note: string | null;
  isBuyNow: boolean;
  status: string;
  round?: number;
  createdAt: string;
  /** ALIM: satıcının taahhüdü; SATIS: alıcının İSTEDİĞİ teslim (LEGACY tarih). */
  deliveryDate?: string | null;
  /** Teslim SÜRESİ (BID_DELIVERY_TIMES). */
  deliveryTime?: string | null;
  validityDays?: number | null;
  /** Geçerlilik rozeti: son geçerlilik = submittedAt + validityDays. */
  submittedAt?: string | null;
  deliveryAddress?: BidDeliveryAddress | null;
  items?: ListingBidItemRow[];
  answers?: { questionId: string; value: string }[];
}

export interface ListingInvitationRow {
  companyName: string;
  rothernId: string | null;
  createdAt: string;
}

export interface ListingAddress {
  title: string;
  addressLine: string;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  contactName: string | null;
  phone: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
}

export interface ListingDetail {
  /** Sunucu parmak izi — bir sonraki istekte If-None-Match olarak gider
   *  (sahip dalı; başkası için tanımsız). Perf turu, denetim P10. */
  etag?: string;
  id: string;
  number: string | null;
  type: ListingType;
  isInternational: boolean;
  targetCountries: string[];
  format: ListingFormat | null;
  priceScope: "TOPLU" | "KALEM" | null;
  minPrice: string | null;
  buyNowPrice: string | null;
  visibility: ListingVisibility;
  title: string;
  description: string | null;
  status: ListingStatus;
  /** Tur sayacı — Yeni Tur diyaloğunun teklifsiz-aktarma uyarısı için. */
  currentRound: number;
  closesAt: string | null;
  cancelReason?: string | null;
  deliveryAddressId?: string | null;
  billingAddressId?: string | null;
  deliveryAddress?: ListingAddress | null;
  billingAddress?: ListingAddress | null;
  createdAt: string;
  owner: { name: string } | null;
  isOwner: boolean;
  /** F7: kazandır/ele buton izin-kapısı (createdById===userId VEYA SAHİP). */
  createdById?: string | null;
  // Sahip + (TASLAK | AÇIK & teklifsiz) → düzenlenebilir.
  canEdit?: boolean;
  // Sahip + TASLAK → yayınlanabilir.
  canPublish?: boolean;
  // Bekleyen onay isteği id'si (IN_APPROVAL / IN_AWARD_APPROVAL'da).
  pendingApprovalId?: string | null;
  // ihale zenginleştirme
  categoryIds?: string[];
  keywords?: string[];
  terms?: string | null;
  requireAllItems?: boolean;
  requireBidDocument?: boolean;
  showTargetToSuppliers?: boolean;
  primaryCurrency?: string;
  allowedCurrencies?: string[];
  // Wizard zenginleştirme (Genel Bilgi sekmesi)
  bidsOpenAt?: string | null;
  isSealedBid?: boolean;
  isLogistics?: boolean;
  logistics?: Record<string, unknown> | null;
  deliveryTerm?: string | null;
  paymentCategory?: string;
  advancePercent?: number | null;
  paymentDays?: number | null;
  lcType?: string | null;
  lcConfirmed?: boolean;
  paymentNote?: string | null;
  paymentTiming?: string;
  /** Teslim öncesi ödemede teminat mektubu şartı (ilan sahibinin seçimi). */
  requireGuaranteeLetter?: boolean;
  bidVisibility?: string;
  decimalPlaces?: number;
  sendClosingReminder?: boolean;
  reminderMinutesBefore?: number | null;
  autoExtendOnLateBid?: boolean;
  autoExtendThresholdMin?: number | null;
  autoExtendByMinutes?: number | null;
  items?: ListingItemRow[];
  /** Kalem sayısı — maskeli önizlemede items boşken de dolu (listeyle tutarlı). */
  itemCount?: number;
  // sahip:
  bids?: ListingBidRow[];
  internalNotes?: string | null;
  invitations?: ListingInvitationRow[];
  // sahip değil:
  masked?: boolean;
  canBid?: boolean;
  /** Rol kapısı: ALIM'a teklif SATISCI, SATIS'a teklif SATIN_ALMACI ister. */
  roleAllowsBid?: boolean;
  invited?: boolean;
  myBid?: {
    amount: string;
    note: string | null;
    status: string;
    isBuyNow?: boolean;
    version?: number;
    submittedAt?: string | null;
    eliminationReason?: string | null;
    eliminatedAt?: string | null;
    updatedAt?: string;
    deliveryDate?: string | null;
    deliveryTime?: string | null;
    validityDays?: number | null;
    /** SATIS: alıcının seçtiği teslimat adresi (kendi adres defterinden). */
    deliveryAddressId?: string | null;
    currency?: string | null;
    items?: ListingBidItemRow[];
    answers?: { questionId: string; value: string }[];
  } | null;
  /** Bu ilandan doğan, çağıranın taraf olduğu sipariş (kazanan teklifçi). */
  myOrder?: { id: string; number: string | null; status: string } | null;
  // İngiliz Usulü (açık eksiltme):
  english?: {
    isEnglishAuction: true;
    currentBest: string | null;
    /** En iyi teklifin KENDİ para birimi (çoklu birimde ilanınkinden farklı olabilir). */
    currentBestCurrency?: string | null;
    bidCount: number;
    currentRound: number;
    /** Açılış günü TCMB kur damgası { USD: 46.89, TRY: 1, ... } — adım/en iyi
     *  teklifçinin birimine bununla çevrilir (ihale boyunca sabit). */
    rateSnapshot?: Record<string, number> | null;
  } | null;
  // Açık eksiltme görünürlüğü (bidVisibility'ye göre, kapalı zarf korunur):
  auctionView?: {
    bestTotal: string | null;
    bestCurrency?: string | null;
    myRank: number | null;
    participantCount: number | null;
    allBids:
      | { rank: number; total: string; currency?: string; isMine: boolean }[]
      | null;
  } | null;
  /** Pazarlık hedefi — sunucunun "kaça inmeliyim/çıkmalıyım" cevabı (placeBid
   *  doğrulamasıyla tek kaynak). Görünürlük en iyi teklifi gizliyorsa hedef
   *  sayıları null gelir (disclosed=false). */
  nextBidConstraint?: {
    direction: "DOWN" | "UP";
    /** SUBMITTED teklif sonrası birim kilitli. */
    currencyLocked: boolean;
    ownCurrency: string | null;
    /** Kendi son SUBMITTED toplamı — tek kural: bundan kesin daha iyi. */
    ownLastTotal: string | null;
    /** Turda tek aktif gönderim hakkı — taşınan (carry-over) teklif yakmaz. */
    canBidThisRound: boolean;
  } | null;
}

export function useListingDetail(id: string) {
  return useQuery({
    queryKey: ["company-listings", "detail", id],
    enabled: !!id,
    queryFn: async ({ client, queryKey }) => {
      // Perf turu (denetim P10): sahip dalı ETag/304 destekliyor. Elimizdeki
      // sürümü If-None-Match ile yolla; sunucu değişmediğini söylerse (304)
      // ağır gövde HİÇ kurulmuyor ve biz mevcut önbelleği koruyoruz.
      // 500 kalem × 30 teklif senaryosunda tur başına ~4 MB → ~0 bayt.
      const prev = client.getQueryData<ListingDetail>(queryKey);
      const { data, status } = await companyApi.get<ListingDetail>(
        `/company/listings/${id}`,
        {
          headers: prev?.etag ? { "If-None-Match": prev.etag } : undefined,
          // 304'ü axios HATA saymasın — beklenen yanıt.
          validateStatus: (s2) => (s2 >= 200 && s2 < 300) || s2 === 304,
        },
      );
      // AYNI referansı döndürmek kasıtlı: TanStack Query `data`'yı değişmemiş
      // sayar → değişmeyen poll ARTIK YENİDEN RENDER DE ÜRETMEZ. İlan detayı
      // sayfası 2100+ satırlık ve sıfır memoizasyonlu; 4 sn'de bir (kapanışa
      // son 2 dk'da 1,5 sn'de bir) baştan render ediliyordu. Yeni nesne
      // döndürmek (ör. `{ ...prev }`) bu kazancı sessizce yok eder.
      if (status === 304 && prev) return prev;
      return data;
    },
    // Canlı güncelleme: açık artırma/eksiltmede 4sn; diğer AÇIK ilanlarda
    // 10sn (yeni teklif/eleme/durum değişikliği yenilemeden görünsün).
    // Kapanmış ilan poll'lanmaz.
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d || d.status !== "OPEN") return false;
      if (!d.english?.isEnglishAuction) return 10_000;
      // Açık artırma/eksiltme: kapanışa son 2 dk'da 1.5sn (snipe/oto-uzatma
      // hassas), aksi 4sn.
      const msLeft = d.closesAt ? new Date(d.closesAt).getTime() - Date.now() : null;
      return msLeft != null && msLeft > 0 && msLeft < 120_000 ? 1500 : 4000;
    },
    refetchOnWindowFocus: true,
  });
}

export function usePlaceBid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount?: number;
      items?: {
        itemId: string;
        unitPrice: number;
        deliveryDate?: string;
        deliveryTime?: string;
        currency?: string;
        answers?: { questionId: string; value: string }[];
      }[];
      note?: string;
      asDraft?: boolean;
      deliveryDate?: string;
      deliveryTime?: string;
      validityDays?: number;
      deliveryAddressId?: string;
      currency?: string;
    }) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/bids`,
        input,
      );
      return data;
    },
    onSuccess: async () => {
      // Detay ANINDA tazelensin: gönderim sonrası detaya dönülüyor —
      // invalidate/sinyal yarışında bayat cache 'Yeni Teklif Ver'i bir süre
      // aktif gösteriyordu. ÖNCE tek doğrudan GET + setQueryData (geniş
      // invalidation'lar bağlantı kuyruğunu doldurmadan); mutateAsync bu
      // bitmeden çözülmez, dönüş taze veriyle açılır (yeni-tur deseni).
      const { data } = await companyApi.get<ListingDetail>(
        `/company/listings/${id}`,
      );
      qc.setQueryData(["company-listings", "detail", id], data);
      invalidateListingCaches(qc, { myBids: true });
    },
  });
}

export function useBuyNow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: {
      note?: string;
      deliveryDate?: string;
      deliveryTime?: string;
      validityDays?: number;
      deliveryAddressId?: string;
      itemIds?: string[];
    }) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/buy-now`,
        input ?? {},
      );
      return data;
    },
    onSuccess: async () => {
      // placeBid ile aynı desen — dönüşte bayat 'Hemen Al/Teklif Ver' kalmasın.
      const { data } = await companyApi.get<ListingDetail>(
        `/company/listings/${id}`,
      );
      qc.setQueryData(["company-listings", "detail", id], data);
      invalidateListingCaches(qc, { myBids: true });
    },
  });
}

export function useCancelListing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason?: string) => {
      const { data } = await companyApi.post(`/company/listings/${id}/cancel`, {
        reason,
      });
      return data;
    },
    onSuccess: () => refreshListingDetail(qc, id),
  });
}

export interface RoundHistoryEntry {
  round: number;
  bids: Array<{ bidderName: string; amount: string }>;
}

/** İngiliz Usulü tur geçmişi (sahip). */
export function useRoundHistory(id: string, enabled: boolean) {
  return useQuery<RoundHistoryEntry[]>({
    queryKey: ["listing-rounds", id],
    queryFn: async () => {
      const { data } = await companyApi.get<RoundHistoryEntry[]>(
        `/company/listings/${id}/rounds`,
      );
      return data;
    },
    enabled,
  });
}

/** Sahip: kapanış zamanını değiştir. */
export function useChangeClosing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (closesAt: string) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/change-closing`,
        { closesAt },
      );
      return data;
    },
    onSuccess: () => refreshListingDetail(qc, id),
  });
}

/** Sahip: şirket-içi notları güncelle. */
export function useUpdateInternalNotes(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notes: string) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/internal-notes`,
        { notes },
      );
      return data;
    },
    onSuccess: () => invalidateListingCaches(qc),
  });
}

/** Sahip: kazanan olmadan kapat (CLOSED_NO_AWARD). */
export function useCloseNoAward(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason?: string) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/close-no-award`,
        { reason },
      );
      return data;
    },
    onSuccess: () => refreshListingDetail(qc, id),
  });
}

// NOT: useWithdrawBid kaldırıldı — teklif geri çekme özelliği kaldırıldı
// (gönderilmiş teklif geri çekilemez; değişiklik alıcı elemesiyle olur).

export function useAwardByItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      itemAwards: {
        itemId: string;
        bidId: string;
        awardedQuantity?: number;
      }[];
      /** Onay akışı devredeyse onaycılara iletilen not. */
      approvalNote?: string;
    }) => {
      const { data } = await companyApi.post<{
        orders?: { id: string; number: string | null }[];
        count?: number;
        pendingApproval?: boolean;
      }>(`/company/listings/${id}/award-by-item`, input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc, { orders: true });
    },
  });
}

export interface NextRoundInput {
  type: "RFQ" | "ENGLISH_AUCTION";
  carryBids: "AUTO" | "LAZY" | "NONE";
  eliminateNonBidders?: boolean;
  closesAt: string;
  bidsOpenAt?: string;
  bidVisibility?: "OWN_ONLY" | "BEST_PRICE" | "OWN_RANK" | "BEST_AND_OWN_RANK" | "ALL";
  autoExtendOnLateBid?: boolean;
  autoExtendThresholdMin?: number;
  autoExtendByMinutes?: number;
}

/** Yeni Tur Oluştur — tek akış (yeni tur + RFQ↔İngiliz dönüşümü). */
export function useCreateNextRound(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NextRoundInput) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/new-round`,
        input,
      );
      return data;
    },
    onSuccess: async () => {
      // Yeni tur ANINDA görünsün: invalidate/sinyal yoluna GÜVENME — geçiş
      // anında sinyal + invalidation çığı istekleri kuyruklatıp iptal
      // zincirine sokuyor, taze cevap dakikalarca uygulanmayabiliyor. Detayı
      // TEK doğrudan istekle çek ve cache'e YAZ; mutateAsync bu await bitmeden
      // çözülmez, diyalog yeni arayüz ekrandayken kapanır.
      const { data } = await companyApi.get<ListingDetail>(
        `/company/listings/${id}`,
      );
      qc.setQueryData(["company-listings", "detail", id], data);
      // Önceki tur arşivlendi — açık tur geçmişi dialog cache'i bayatlamasın.
      qc.invalidateQueries({ queryKey: ["listing-rounds", id] });
      // Listeler arkadan tazelenir (detay az önce yazıldı; yeniden çekilse de
      // aynı veri döner).
      invalidateListingCaches(qc);
    },
  });
}

/** Değerlendirmeye Al — teklif alımını şimdi durdurur (OPEN → IN_AWARD). */
export function useStartEvaluation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{ ok: boolean; status: string }>(
        `/company/listings/${id}/start-evaluation`,
      );
      return data;
    },
    onSuccess: () => refreshListingDetail(qc, id),
  });
}

/**
 * Teklif geçerlilik süresini uzat (fiyat değişmeden) — taşımada süresi
 * dolduğu için taslağa düşmüş teklifi aynı fiyatla canlandırabilir.
 */
export function useExtendBidValidity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (additionalDays: number) => {
      const { data } = await companyApi.post<{
        ok: boolean;
        validityDays: number;
        validUntil: string;
        revived: boolean;
      }>(`/company/listings/${id}/bids/extend-validity`, { additionalDays });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      // `revived: true` teklifi DRAFT'tan SUBMITTED'a taşıyabiliyor →
      // Tekliflerim listesi de tazelenmeli (denetim 2026-08-26 Parça 10).
      invalidateListingCaches(qc, { myBids: true });
    },
  });
}

/** Yayın sonrası tedarikçi daveti ekleme. */
export function useAddInvitations(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rothernIds: string[]) => {
      const { data } = await companyApi.post<{ added: number; skipped: number }>(
        `/company/listings/${id}/invitations`,
        { rothernIds },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc);
    },
  });
}

export function useEliminateBid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bidId, reason }: { bidId: string; reason?: string }) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/bids/${bidId}/eliminate`,
        { reason },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc);
    },
  });
}

export function useAwardListing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bidId: string; approvalNote?: string }) => {
      const { data } = await companyApi.post<{
        orderId?: string;
        number?: string;
        pendingApproval?: boolean;
      }>(`/company/listings/${id}/award`, input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc, { orders: true });
    },
  });
}

// Ön kontrol (tıklama-anı, salt-okunur): bu teklifi/kalem dağılımını bu tutarda
// kazandırmak onay akışına takılır mı? "Onaya Gönder" dialogu YALNIZ
// requiresApproval=true ise gösterilir. Query DEĞİL mutation — cache yok, her
// tıklamada taze sunucu kararı (bayat award:true imkânsız). Backend award-anıyla
// AYNI tutarı + eleme mantığını kullanır (tek kaynak).
export function useAwardPreview(id: string) {
  return useMutation({
    mutationFn: async (input: { bidId: string }) => {
      const { data } = await companyApi.post<{ requiresApproval: boolean }>(
        `/company/listings/${id}/award/preview`,
        input,
      );
      return data;
    },
  });
}

export function useAwardByItemPreview(id: string) {
  return useMutation({
    mutationFn: async (input: {
      itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[];
    }) => {
      const { data } = await companyApi.post<{ requiresApproval: boolean }>(
        `/company/listings/${id}/award-by-item/preview`,
        input,
      );
      return data;
    },
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateListingInput) => {
      const { data } = await companyApi.post<Listing>(
        "/company/listings",
        input,
      );
      return data;
    },
    onSuccess: () => invalidateListingCaches(qc),
  });
}

/** Taslağı yayınla (DRAFT → OPEN). */
export function usePublishListing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { approvalNote?: string }) => {
      const { data } = await companyApi.post<Listing>(
        `/company/listings/${id}/publish`,
        input ?? {},
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc);
    },
  });
}

/** Taslak ilanı sil. */
export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(`/company/listings/${id}`);
      return data;
    },
    onSuccess: () => invalidateListingCaches(qc),
  });
}

/** İlanı güncelle (sahip, açık + teklif gelmemişken). */
export function useUpdateListing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateListingInput) => {
      const { data } = await companyApi.patch<Listing>(
        `/company/listings/${id}`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc);
    },
  });
}
