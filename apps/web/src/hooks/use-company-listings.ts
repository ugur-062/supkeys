"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ListingType = "ALIM" | "SATIS";
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

export interface CreateListingInput {
  type: ListingType;
  visibility: ListingVisibility;
  title: string;
  description?: string;
  closesAt?: string;
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

export interface ListingBidRow {
  id: string;
  bidderName: string;
  amount: string;
  note: string | null;
  status: string;
  createdAt: string;
}

export interface ListingDetail {
  id: string;
  number: string | null;
  type: ListingType;
  visibility: ListingVisibility;
  title: string;
  description: string | null;
  status: ListingStatus;
  closesAt: string | null;
  createdAt: string;
  owner: { name: string } | null;
  isOwner: boolean;
  // sahip:
  bids?: ListingBidRow[];
  // sahip değil:
  masked?: boolean;
  canBid?: boolean;
  myBid?: { amount: string; note: string | null; status: string } | null;
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
  });
}

export function usePlaceBid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: number; note?: string }) => {
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
