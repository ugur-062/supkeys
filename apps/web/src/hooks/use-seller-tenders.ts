"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

/** GET /company/listings/seller-tenders satırı. */
export interface SellerTenderRow {
  id: string;
  number: string | null;
  title: string;
  status: string;
  visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE";
  format: string | null;
  currency: string;
  isInternational: boolean;
  closesAt: string | null;
  createdAt: string;
  itemCount: number;
  owner: { id: string; name: string } | null;
  /** Şehir kimlik DEĞİL nitelik — maskeli kartta da kalır (lojistik kararı). */
  ownerCity?: string | null;
  /** Kapak görseli: sahibin seçtiği, yoksa ilk kalemin ilk görseli. */
  coverImageUrl?: string | null;
  masked: boolean;
  canBid: boolean;
  invited: boolean;
  /** Talebi açan firma bağlantım mı (aktif iş ilişkisi) — sıralama sinyali. */
  connected: boolean;
  myBidStatus: string | null;
  myBidVersion: number | null;
  categoryMatch: boolean;
  /**
   * İlgi motoru: bu ilan neden karşınıza çıktı ("Bu alanda daha önce teklif
   * verdiniz" gibi). Backend ham sinyalden türetir; null olabilir.
   */
  matchReason?: string | null;
  /** İlgi skoru (0-100, firma başına normalize). Sıralama kademesi için. */
  matchScore?: number;
  categories: { code: string; name: string }[];
  extraCategoryCount: number;
}

/** Başka firmaların AÇIK ALIM talepleri (Açık Talepler). */
export function useSellerTenders() {
  return useQuery<SellerTenderRow[]>({
    queryKey: ["company-listings", "seller-tenders", "ALIM"],
    queryFn: async () => {
      const { data } = await companyApi.get<SellerTenderRow[]>(
        "/company/listings/seller-tenders?type=ALIM",
      );
      return data;
    },
    staleTime: 10_000,
    refetchInterval: 15_000, // canlı liste — teklif durumu/kapanış tazelensin
    refetchOnWindowFocus: true,
  });
}
