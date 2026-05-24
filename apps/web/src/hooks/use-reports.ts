"use client";

// V2-7+ — Rapor hook'ları. Fetch (JSON) + Download (PDF/Excel) ayrı mutation'lar.
// JSON: web view'da tablo render için; binary: blob download.

import { api } from "@/lib/api";
import type {
  BidComparisonReportResult,
  GeneralReportResult,
  ReportFormat,
  SavingsReportResult,
} from "@/lib/reports/types";
import { useMutation } from "@tanstack/react-query";

export type GeneralPayload = {
  mode: "SINGLE" | "RANGE";
  tenderId?: string;
  rangeStart?: string;
  rangeEnd?: string;
  tenderType?: string;
  status?: string;
  currency?: string;
  supplierIds?: string[];
};

export type SavingsPayload = {
  rangeStart: string;
  rangeEnd: string;
  currency?: string;
  supplierIds?: string[];
};

export type BidComparisonPayload = {
  tenderId: string;
  criteria: Array<"PRICE" | "ANSWERS" | "BOTH">;
  includeAllRounds?: boolean;
  includeNonBidders?: boolean;
  showBidCurrencies?: boolean;
};

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function suggestedFilename(base: string, format: ReportFormat): string {
  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const ext = format === "pdf" ? "pdf" : format === "xlsx" ? "xlsx" : "json";
  return `${base}_${ts}.${ext}`;
}

// ---------------- GENEL ----------------

export function useGeneralReport() {
  return useMutation({
    mutationFn: async (payload: GeneralPayload) => {
      const { data } = await api.post<GeneralReportResult>(
        "/tenants/me/reports/general?format=json",
        payload,
      );
      return data;
    },
  });
}

export function useDownloadGeneralReport() {
  return useMutation({
    mutationFn: async (input: {
      payload: GeneralPayload;
      format: "xlsx";
    }) => {
      const { data, headers } = await api.post(
        `/tenants/me/reports/general?format=${input.format}`,
        input.payload,
        { responseType: "blob" },
      );
      const cd: string = headers["content-disposition"] ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? suggestedFilename("genel-ihale-raporu", input.format);
      triggerBrowserDownload(data as Blob, filename);
      return { filename };
    },
  });
}

// ---------------- TASARRUF ----------------

export function useSavingsReport() {
  return useMutation({
    mutationFn: async (payload: SavingsPayload) => {
      const { data } = await api.post<SavingsReportResult>(
        "/tenants/me/reports/savings?format=json",
        payload,
      );
      return data;
    },
  });
}

export function useDownloadSavingsReport() {
  return useMutation({
    mutationFn: async (input: {
      payload: SavingsPayload;
      format: "xlsx";
    }) => {
      const { data, headers } = await api.post(
        `/tenants/me/reports/savings?format=${input.format}`,
        input.payload,
        { responseType: "blob" },
      );
      const cd: string = headers["content-disposition"] ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? suggestedFilename("tasarruf-raporu", input.format);
      triggerBrowserDownload(data as Blob, filename);
      return { filename };
    },
  });
}

// ---------------- TEKLİF KARŞILAŞTIRMA ----------------

export function useBidComparisonReport() {
  return useMutation({
    mutationFn: async (payload: BidComparisonPayload) => {
      const { data } = await api.post<BidComparisonReportResult>(
        "/tenants/me/reports/bid-comparison?format=json",
        payload,
      );
      return data;
    },
  });
}

export function useDownloadBidComparisonReport() {
  return useMutation({
    mutationFn: async (input: {
      payload: BidComparisonPayload;
      format: "xlsx";
    }) => {
      const { data, headers } = await api.post(
        `/tenants/me/reports/bid-comparison?format=${input.format}`,
        input.payload,
        { responseType: "blob" },
      );
      const cd: string = headers["content-disposition"] ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename =
        match?.[1] ?? suggestedFilename("teklif-karsilastirma-raporu", input.format);
      triggerBrowserDownload(data as Blob, filename);
      return { filename };
    },
  });
}
