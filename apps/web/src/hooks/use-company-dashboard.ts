"use client";

import type { TasarrufTabData } from "@/components/dashboard/tasarruf-tab";
import type { TedarikciTabData } from "@/components/dashboard/tedarikci-tab";
import { companyApi } from "@/lib/company-auth/api";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export interface OpenTenderRow {
  id: string;
  tenderNumber: string;
  title: string;
  openedAt: string;
  closesAt: string;
}

export interface SatinalmaDashboard {
  openCount: number;
  bidsReceived: number;
  awarded: number;
  ongoingOrders: number;
  /** Davet edilip teklif verilmemiş açık SATIŞ ihalesi sayısı (anasayfa uyarısı). */
  invitedPending: number;
  openTendersOwn: OpenTenderRow[];
  openTendersCompany: OpenTenderRow[];
}

export interface SatisDashboard {
  openCount: number;
  activeBids: number;
  awarded: number;
  ongoingOrders: number;
  openTendersOwn: OpenTenderRow[];
  openTendersCompany: OpenTenderRow[];
}

export function useSatinalmaDashboard() {
  return useQuery<SatinalmaDashboard>({
    queryKey: ["company-dashboard", "satinalma"],
    queryFn: async () => {
      const { data } = await companyApi.get<SatinalmaDashboard>(
        "/company/dashboard/satinalma",
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useSatinalmaTasarruf() {
  return useQuery<TasarrufTabData>({
    queryKey: ["company-dashboard", "satinalma", "tasarruf"],
    queryFn: async () => {
      const { data } = await companyApi.get<TasarrufTabData>(
        "/company/dashboard/satinalma/tasarruf",
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSatinalmaTedarikci() {
  return useQuery<TedarikciTabData>({
    queryKey: ["company-dashboard", "satinalma", "tedarikci"],
    queryFn: async () => {
      const { data } = await companyApi.get<TedarikciTabData>(
        "/company/dashboard/satinalma/tedarikci",
      );
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSatisDashboard() {
  return useQuery<SatisDashboard>({
    queryKey: ["company-dashboard", "satis"],
    queryFn: async () => {
      const { data } = await companyApi.get<SatisDashboard>(
        "/company/dashboard/satis",
      );
      return data;
    },
    staleTime: 60_000,
  });
}

// ── Satış panosu — eski tedarikçi paneli paritesi (stats + aktivite) ──

export interface SatisStats {
  invitations: { active: number };
  bids: { active: number };
  wonTenders: number;
  orders: { pending: number };
  revenue: { total: number; last30: number; prev30: number };
  last30Days: { bidsSubmitted: number; prevBidsSubmitted: number };
  buyers: { active: number };
}

export interface SatisActivityRow {
  type: "invitation" | "bid" | "order";
  title: string;
  subtitle: string;
  at: string;
  href: string;
}

export function useSatisStats() {
  return useQuery<SatisStats>({
    queryKey: ["company-dashboard", "satis", "stats"],
    queryFn: async () => {
      const { data } = await companyApi.get<SatisStats>(
        "/company/dashboard/satis/stats",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export interface SatisActivityPage {
  rows: SatisActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function useSatisActivity(limit = 8, page = 1) {
  return useQuery<SatisActivityPage>({
    queryKey: ["company-dashboard", "satis", "aktivite", limit, page],
    queryFn: async () => {
      const { data } = await companyApi.get<SatisActivityPage>(
        `/company/dashboard/satis/aktivite?limit=${limit}&page=${page}`,
      );
      return data;
    },
    // Sayfa geçişinde önceki sayfa görünür kalsın (liste zıplamasın).
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
