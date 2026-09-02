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
  name: string;
  companyName: string | null;
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

export function useReceivedInquiries() {
  return useQuery<{ items: ReceivedInquiry[]; total: number }>({
    queryKey: [...INQUIRY_KEY, "received"],
    queryFn: async () => {
      const { data } = await companyApi.get("/company/inquiries/received");
      return data;
    },
  });
}

export function useSentInquiries() {
  return useQuery<SentInquiry[]>({
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
