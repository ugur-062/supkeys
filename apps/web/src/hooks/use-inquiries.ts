"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * BİLGİ TALEPLERİ — iki yön, aynı tablo.
 *   `received` → firmanın ÜRÜNLERİNE gelen talepler (satıcı gözü)
 *   `sent`     → kullanıcının MİSAFİRKEN gönderdiği ve kaydolunca hesabına
 *                bağlanan talepler (alıcı gözü)
 *
 * `sent` çağrısı bağlamayı TEMBEL yapar (serviste) — sayfaya her giriş
 * idempotenttir ve kayıt akışına bağımlılık eklemez.
 */
export interface InquiryReply {
  id: string;
  body: string;
  createdAt: string;
}

export interface ReceivedInquiry {
  id: string;
  /** Ücretsiz satıcıda null — kimlik sunucuda düşer (2026-09-06). */
  name: string | null;
  companyName: string | null;
  /** Kimlik sunucuda düşürüldü (ücretsiz satıcı). */
  anonymous?: boolean;
  /** Kayıtlı alıcının şehri/faaliyeti — kimlik değil nitelik, anonim kartta da kalır. */
  buyerCity?: string | null;
  buyerActivities?: string[];
  message: string;
  quantity: string | null;
  receivedAt: string | null;
  /** Ziyaretçi kaydoldu mu — kaydolduysa panelden de ulaşılabilir. */
  hasAccount: boolean;
  product: { name: string; slug: string | null };
  replies: InquiryReply[];
}

export interface SentInquiry {
  id: string;
  message: string;
  quantity: string | null;
  sentAt: string | null;
  seller: { name: string; slug: string | null };
  product: { name: string; slug: string | null };
  replies: InquiryReply[];
}

export const INQUIRY_KEY = ["company-inquiries"] as const;

/** `enabled=false` → karşı portalda gereksiz istek atılmaz. */
export function useReceivedInquiries(enabled = true) {
  return useQuery<{ items: ReceivedInquiry[]; total: number; locked?: boolean }>({
    enabled,
    queryKey: [...INQUIRY_KEY, "received"],
    queryFn: async () => {
      const { data } = await companyApi.get("/company/inquiries/received");
      return data;
    },
  });
}

export function useSentInquiries(enabled = true) {
  return useQuery<SentInquiry[]>({
    enabled,
    queryKey: [...INQUIRY_KEY, "sent"],
    queryFn: async () => {
      const { data } = await companyApi.get<SentInquiry[]>(
        "/company/inquiries/sent",
      );
      return data;
    },
  });
}

export function useReplyInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { data } = await companyApi.post<InquiryReply>(
        `/company/inquiries/${id}/reply`,
        { body },
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INQUIRY_KEY });
    },
  });
}

/**
 * KAYITLI alıcının bilgi talebi. Misafir yolundan (`/public/inquiries`)
 * ayrıdır ve ayrı olması zorunlu: o uç pazar yeri anahtarına tabi (kapalıyken
 * 404) ve kimlik alanlarını GÖVDEDEN alıyor. Burada ad/e-posta/firma
 * oturumdan gelir — kullanıcıya kendi bildiğimiz bilgiyi yazdırmayız.
 */
export function useSendInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companySlug: string;
      productSlug: string;
      message: string;
      quantity?: string;
    }) => {
      const { data } = await companyApi.post<{ id: string }>(
        "/company/inquiries",
        input,
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INQUIRY_KEY });
    },
  });
}
