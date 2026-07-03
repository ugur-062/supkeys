"use client";

import { companyApi } from "@/lib/company-auth/api";
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

export interface BrowseListing {
  id: string;
  number: string | null;
  type: ListingType;
  visibility: ListingVisibility;
  title: string;
  description: string | null;
  status: ListingStatus;
  createdAt: string;
  owner: { name: string } | null; // null = maskeli (standart + public)
  masked: boolean;
  canBid: boolean;
}

// Backend Prisma `Currency` enum'u ile birebir (8 birim) — eksik tutmak
// AED/CNY tekliflerini `as` cast'leriyle maskeleyip sessiz hataya yol açıyordu.
export type CurrencyCode =
  | "TRY"
  | "USD"
  | "EUR"
  | "GBP"
  | "CHF"
  | "JPY"
  | "AED"
  | "CNY";

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
  invitations?: string[]; // davet edilen supkeysId'ler
  categoryIds?: string[]; // UNGM UNSPSC TR kategori kodları
  keywords?: string[];
  terms?: string;
  internalNotes?: string;
  requireAllItems?: boolean;
  requireBidDocument?: boolean;
  isSealedBid?: boolean;
  primaryCurrency?: CurrencyCode;
  allowedCurrencies?: CurrencyCode[];
  // Teslim / ödeme
  deliveryTerm?: string;
  paymentTerm?: "CASH" | "DEFERRED";
  paymentDays?: number;
  paymentTiming?: "BEFORE_DELIVERY" | "AFTER_DELIVERY";
  // Lojistik
  isLogistics?: boolean;
  logistics?: Record<string, unknown>;
  // İngiliz Usulü açık eksiltme
  bidVisibility?: string;
  priceDecrementType?: "AMOUNT" | "PERCENT";
  priceDecrementValue?: number;
  priceDecrementBasis?: "OWN_LAST_BID" | "BEST_BID";
  decimalPlaces?: number;
  sendClosingReminder?: boolean;
  reminderMinutesBefore?: number;
  autoExtendOnLateBid?: boolean;
  autoExtendThresholdMin?: number;
  autoExtendByMinutes?: number;
}

export function useMyListings() {
  return useQuery({
    queryKey: ["company-listings", "mine"],
    queryFn: async () => {
      const { data } = await companyApi.get<Listing[]>("/company/listings");
      return data;
    },
  });
}

export interface MyBid {
  id: string;
  amount: string;
  currency: CurrencyCode;
  status: "SUBMITTED" | "WITHDRAWN" | "WON" | "LOST";
  round: number;
  version: number;
  isBuyNow: boolean;
  createdAt: string;
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

export type BrowseScope = "domestic" | "international";

export function useBrowseListings(scope: BrowseScope = "domestic") {
  return useQuery({
    queryKey: ["company-listings", "browse", scope],
    queryFn: async () => {
      const { data } = await companyApi.get<BrowseListing[]>(
        "/company/listings/browse",
        { params: { scope } },
      );
      return data;
    },
  });
}

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
  /** ALIM: satıcının taahhüdü; SATIS: alıcının İSTEDİĞİ teslim tarihi. */
  deliveryDate?: string | null;
  validityDays?: number | null;
  deliveryAddress?: BidDeliveryAddress | null;
  items?: ListingBidItemRow[];
  answers?: { questionId: string; value: string }[];
}

export interface ListingInvitationRow {
  companyName: string;
  supkeysId: string | null;
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
  closesAt: string | null;
  cancelReason?: string | null;
  deliveryAddressId?: string | null;
  billingAddressId?: string | null;
  deliveryAddress?: ListingAddress | null;
  billingAddress?: ListingAddress | null;
  createdAt: string;
  owner: { name: string } | null;
  isOwner: boolean;
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
  primaryCurrency?: string;
  allowedCurrencies?: string[];
  // Wizard zenginleştirme (Genel Bilgi sekmesi)
  bidsOpenAt?: string | null;
  isSealedBid?: boolean;
  isLogistics?: boolean;
  logistics?: Record<string, unknown> | null;
  deliveryTerm?: string | null;
  paymentTerm?: string;
  paymentDays?: number | null;
  paymentTiming?: string;
  bidVisibility?: string;
  priceDecrementType?: string | null;
  priceDecrementValue?: string | null;
  priceDecrementBasis?: string | null;
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
    validityDays?: number | null;
    /** SATIS: alıcının seçtiği teslimat adresi (kendi adres defterinden). */
    deliveryAddressId?: string | null;
    currency?: string | null;
    items?: ListingBidItemRow[];
    answers?: { questionId: string; value: string }[];
  } | null;
  // İngiliz Usulü (açık eksiltme):
  english?: {
    isEnglishAuction: true;
    currentBest: string | null;
    bidCount: number;
    currentRound: number;
  } | null;
  // Açık eksiltme görünürlüğü (bidVisibility'ye göre, kapalı zarf korunur):
  auctionView?: {
    bestTotal: string | null;
    myRank: number | null;
    participantCount: number | null;
    allBids: { rank: number; total: string; isMine: boolean }[] | null;
  } | null;
}

export function useListingDetail(id: string) {
  return useQuery({
    queryKey: ["company-listings", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await companyApi.get<ListingDetail>(
        `/company/listings/${id}`,
      );
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
        answers?: { questionId: string; value: string }[];
      }[];
      note?: string;
      asDraft?: boolean;
      deliveryDate?: string;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
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
    onSuccess: () => invalidateListingCaches(qc),
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

/** Sahip: ihaleyi erken kapat (OPEN → CLOSED). */
export function useCloseEarly(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/close-early`,
      );
      return data;
    },
    onSuccess: () => invalidateListingCaches(qc),
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
    onSuccess: () => invalidateListingCaches(qc),
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
    onSuccess: () => invalidateListingCaches(qc),
  });
}

export function useWithdrawBid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/withdraw-bid`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc, { myBids: true });
    },
  });
}

export function useAwardByItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      itemAwards: {
        itemId: string;
        bidId: string;
        awardedQuantity?: number;
      }[],
    ) => {
      const { data } = await companyApi.post<{
        orders?: { id: string; number: string | null }[];
        count?: number;
        pendingApproval?: boolean;
      }>(`/company/listings/${id}/award-by-item`, { itemAwards });
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
  priceDecrementType?: "AMOUNT" | "PERCENT";
  priceDecrementValue?: number;
  priceDecrementBasis?: "OWN_LAST_BID" | "BEST_BID";
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      // Önceki tur arşivlendi — açık tur geçmişi dialog cache'i bayatlamasın.
      qc.invalidateQueries({ queryKey: ["listing-rounds", id] });
      invalidateListingCaches(qc);
    },
  });
}

/** Yayın sonrası tedarikçi daveti ekleme. */
export function useAddInvitations(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supkeysIds: string[]) => {
      const { data } = await companyApi.post<{ added: number; skipped: number }>(
        `/company/listings/${id}/invitations`,
        { supkeysIds },
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
    mutationFn: async (bidId: string) => {
      const { data } = await companyApi.post<{
        orderId?: string;
        number?: string;
        pendingApproval?: boolean;
      }>(`/company/listings/${id}/award`, { bidId });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      invalidateListingCaches(qc, { orders: true });
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
    mutationFn: async () => {
      const { data } = await companyApi.post<Listing>(
        `/company/listings/${id}/publish`,
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
