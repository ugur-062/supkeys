"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ListingType = "ALIM" | "SATIS";
export type ListingFormat = "RFQ" | "ENGLISH_AUCTION";
export type ListingVisibility = "PUBLIC" | "CONNECTIONS" | "PRIVATE";
export type ListingStatus =
  | "DRAFT"
  | "OPEN"
  | "CLOSED"
  | "AWARDED"
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

export type CurrencyCode = "TRY" | "USD" | "EUR" | "GBP" | "CHF" | "JPY";

export interface ListingItemInput {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  targetPrice?: number;
}

export interface CreateListingInput {
  type: ListingType;
  isInternational: boolean;
  format?: ListingFormat; // ALIM
  minPrice?: number; // SATIS
  buyNowPrice?: number; // SATIS
  visibility: ListingVisibility;
  title: string;
  description?: string;
  closesAt?: string;
  // İhale (ALIM) zenginleştirme
  items?: ListingItemInput[];
  invitations?: string[]; // davet edilen supkeysId'ler
  categoryIds?: string[]; // UNGM UNSPSC TR kategori kodları
  keywords?: string[];
  terms?: string;
  internalNotes?: string;
  requireAllItems?: boolean;
  requireBidDocument?: boolean;
  primaryCurrency?: CurrencyCode;
  allowedCurrencies?: CurrencyCode[];
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
  isBuyNow: boolean;
  createdAt: string;
  listing: {
    id: string;
    number: string | null;
    title: string;
    type: ListingType;
    status: ListingStatus;
    closesAt: string | null;
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
  });
}

export function useBrowseListings() {
  return useQuery({
    queryKey: ["company-listings", "browse"],
    queryFn: async () => {
      const { data } = await companyApi.get<BrowseListing[]>(
        "/company/listings/browse",
      );
      return data;
    },
  });
}

export interface ListingItemRow {
  id: string;
  lineNo: number;
  name: string;
  description: string | null;
  quantity: string;
  unit: string;
  targetPrice: string | null;
}

export interface ListingBidItemRow {
  itemId: string;
  unitPrice: string;
}

export interface ListingBidRow {
  id: string;
  bidderName: string;
  amount: string;
  currency?: string;
  note: string | null;
  isBuyNow: boolean;
  status: string;
  round?: number;
  createdAt: string;
  items?: ListingBidItemRow[];
}

export interface ListingInvitationRow {
  companyName: string;
  supkeysId: string | null;
  createdAt: string;
}

export interface ListingDetail {
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
  owner: { name: string } | null;
  isOwner: boolean;
  // ihale zenginleştirme
  categoryIds?: string[];
  keywords?: string[];
  terms?: string | null;
  requireAllItems?: boolean;
  requireBidDocument?: boolean;
  primaryCurrency?: string;
  allowedCurrencies?: string[];
  items?: ListingItemRow[];
  // sahip:
  bids?: ListingBidRow[];
  internalNotes?: string | null;
  invitations?: ListingInvitationRow[];
  // sahip değil:
  masked?: boolean;
  canBid?: boolean;
  myBid?: {
    amount: string;
    note: string | null;
    status: string;
    items?: ListingBidItemRow[];
  } | null;
  // İngiliz Usulü (açık eksiltme):
  english?: {
    isEnglishAuction: true;
    currentBest: string | null;
    bidCount: number;
    currentRound: number;
  } | null;
}

export function useListingDetail(id: string) {
  return useQuery({
    queryKey: ["company-listings", "detail", id],
    queryFn: async () => {
      const { data } = await companyApi.get<ListingDetail>(
        `/company/listings/${id}`,
      );
      return data;
    },
    // Açık eksiltme açıkken canlı güncelleme için poll.
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.english?.isEnglishAuction && d.status === "OPEN" ? 4000 : false;
    },
  });
}

export function usePlaceBid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount?: number;
      items?: { itemId: string; unitPrice: number }[];
      note?: string;
    }) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/bids`,
        input,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] }),
  });
}

export function useBuyNow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(`/company/listings/${id}/buy-now`);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] }),
  });
}

export function useCancelListing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post(`/company/listings/${id}/cancel`);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-listings"] }),
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] }),
  });
}

export function useAwardByItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      itemAwards: { itemId: string; bidId: string }[],
    ) => {
      const { data } = await companyApi.post<{
        orders: { id: string; number: string | null }[];
        count: number;
      }>(`/company/listings/${id}/award-by-item`, { itemAwards });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-listings"] }),
  });
}

export function useStartNewRound(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{ currentRound: number }>(
        `/company/listings/${id}/new-round`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] }),
  });
}

export function useEliminateBid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bidId: string) => {
      const { data } = await companyApi.post(
        `/company/listings/${id}/bids/${bidId}/eliminate`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] }),
  });
}

export function useAwardListing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bidId: string) => {
      const { data } = await companyApi.post<{ orderId: string; number: string }>(
        `/company/listings/${id}/award`,
        { bidId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-listings", "detail", id] });
      qc.invalidateQueries({ queryKey: ["company-orders"] });
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-listings", "mine"] }),
  });
}
