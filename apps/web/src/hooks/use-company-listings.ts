"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ListingType = "ALIM" | "SATIS";
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
  title: string;
  description: string | null;
  status: ListingStatus;
  closesAt: string | null;
  createdAt: string;
}

export interface CreateListingInput {
  type: ListingType;
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
