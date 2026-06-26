"use client";

import type { TasarrufTabData } from "@/components/dashboard/tasarruf-tab";
import type { TedarikciTabData } from "@/components/dashboard/tedarikci-tab";
import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

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
