"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

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

/** `GET /company/inquiries/received?page=` — sunucu 20'şer sayfalar. */
interface ReceivedInquiriesPage {
  items: ReceivedInquiry[];
  total: number;
  /** Yanıt bekleyen TOPLAM (sayfadan bağımsız; eski yanıtta yok). */
  openCount?: number;
  locked?: boolean;
}

/**
 * Gelen talepler — SAYFALI (`?page=`, "daha fazla yükle"). Eskiden tek
 * parametresiz çağrıydı: sunucu ilk 20'yi döndürüyor, 21. ve daha eski
 * talepler panelde hiç görünmüyor ve yanıtlanamıyordu; sayaçlar da yalnız
 * bu 20 satırdan hesaplanıyordu. `data` yüklü sayfaların birleşimidir
 * (yeni talep sayfaları kaydırırsa aynı kayıt iki kez gelmez); `total`/
 * `openCount` sunucunun toplamıdır.
 *
 * `enabled=false` → karşı portalda gereksiz istek atılmaz.
 */
export function useReceivedInquiries(enabled = true) {
  const q = useInfiniteQuery<ReceivedInquiriesPage>({
    enabled,
    queryKey: [...INQUIRY_KEY, "received"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await companyApi.get<ReceivedInquiriesPage>(
        "/company/inquiries/received",
        { params: { page: pageParam } },
      );
      return data;
    },
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? all.length + 1 : undefined;
    },
  });
  const pages = q.data?.pages;
  const data = useMemo(() => {
    if (!pages?.length) return undefined;
    const seen = new Set<string>();
    const items: ReceivedInquiry[] = [];
    for (const p of pages) {
      for (const it of p.items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(it);
      }
    }
    const last = pages[pages.length - 1]!;
    return {
      items,
      total: Math.max(last.total, items.length),
      openCount: last.openCount,
      locked: last.locked,
    };
  }, [pages]);
  return {
    data,
    isLoading: q.isLoading,
    hasNextPage: q.hasNextPage,
    fetchNextPage: q.fetchNextPage,
    isFetchingNextPage: q.isFetchingNextPage,
  };
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
