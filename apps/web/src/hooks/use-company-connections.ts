"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { Locale } from "@rothern/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ConnectionOrigin = "INVITE" | "PREMIUM" | "ADMIN";

export interface ConnectionCompany {
  id: string;
  name: string;
  rothernId: string | null;
  // İhale daveti adımı için zengin kart alanları (yalnızca bağlantı listesinde dolu).
  tier?: "STANDART" | "SILVER" | "GOLD";
  taxNumber?: string | null;
  city?: string | null;
  country?: string | null;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  /** Kart zenginleştirme (v2 6f) — eklemeli alanlar. */
  logoUrl?: string | null;
  verified?: boolean;
  activities?: string[];
  /** Satış kategori beyanı (ana + alt) — davet seçicisinin uygunluk sırası için. */
  categoryIds?: string[];
  /** Yayındaki ürünlerden ilk 3 küçük resim + toplam. */
  productPreview?: { thumbnails: string[]; total: number } | null;
}

export interface Connection {
  connectionId: string;
  origin: ConnectionOrigin;
  company: ConnectionCompany;
  decidedAt: string | null;
}

export interface IncomingInvite {
  connectionId: string;
  company: ConnectionCompany;
  createdAt: string;
}

export interface ConnectionSelf {
  rothernId: string | null;
}

export function useConnectionSelf() {
  return useQuery({
    queryKey: ["company-connections", "self"],
    queryFn: async () => {
      const { data } = await companyApi.get<ConnectionSelf>(
        "/company/connections/self",
      );
      return data;
    },
  });
}

export interface ReferralInviteRow {
  id: string;
  email: string;
  createdAt: string;
}

export function useReferralInvites() {
  return useQuery({
    queryKey: ["company-connections", "referral-invites"],
    queryFn: async () => {
      const { data } = await companyApi.get<ReferralInviteRow[]>(
        "/company/connections/referral-invites",
      );
      return data;
    },
  });
}

/**
 * "Tedarikçini davet et" — kayıtsız adrese davet e-postası. `locale` davet
 * e-postasının dili (2026-09-27; ekranda adres başına seçilir, varsayılanı
 * `recipientLocale`); verilmezse sunucu türetir.
 */
export function useInviteByEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { email: string; locale?: Locale }) => {
      const body = typeof input === "string" ? { email: input } : input;
      const { data } = await companyApi.post<{
        kind: "request" | "invited";
        targetName?: string;
        email?: string;
        /** Davet e-postasının GERÇEK sonucu (yalnız `invited`); eski API döndürmez. */
        delivery?: "SENT" | "FAILED" | "SUPPRESSED";
        emailSent?: boolean;
      }>("/company/connections/invite-by-email", body);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-connections"] }),
  });
}

export interface BatchInviteResult {
  results: {
    email: string;
    /** `failed`: kayıt oluştu ama e-posta gitmedi (sağlayıcı hatası ya da adres e-posta almıyor). */
    status: "request" | "invited" | "skipped" | "failed";
    /** Makine kodu: SENT · FAILED · SUPPRESSED · ALREADY_INVITED · DAILY_LIMIT · OPTED_OUT · REQUEST */
    code?: string;
    targetName?: string;
    reason?: string;
  }[];
  summary: { request: number; invited: number; skipped: number; failed?: number };
}

export function useInviteByEmailBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string[] | { email: string; locale?: Locale }[]) => {
      // Gönderimler artık BEKLENİR (adres başına gerçek sonuç) — 50 adreste
      // varsayılan 45 sn'yi aşabilir. Adres başına dil `invites` ile gider.
      const invites = input.map((i) => (typeof i === "string" ? { email: i } : i));
      const { data } = await companyApi.post<BatchInviteResult>(
        "/company/connections/invite-by-email/batch",
        { invites },
        { timeout: 120_000 },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-connections"] });
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export function useConnections() {
  return useQuery({
    queryKey: ["company-connections", "active"],
    queryFn: async () => {
      const { data } = await companyApi.get<Connection[]>(
        "/company/connections",
      );
      return data;
    },
  });
}

export function useOutgoingInvites() {
  return useQuery({
    queryKey: ["company-connections", "outgoing"],
    queryFn: async () => {
      const { data } = await companyApi.get<IncomingInvite[]>(
        "/company/connections/outgoing",
      );
      return data;
    },
  });
}

export function useCancelReferralInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(
        `/company/connections/referral-invites/${id}`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-connections"] }),
  });
}

export function useIncomingInvites() {
  return useQuery({
    queryKey: ["company-connections", "incoming"],
    queryFn: async () => {
      const { data } = await companyApi.get<IncomingInvite[]>(
        "/company/connections/incoming",
      );
      return data;
    },
  });
}

export interface DiscoverCompany {
  id: string;
  name: string;
  rothernId: string | null;
  industry: string | null;
  /** Faaliyet tipi kodları (üretici/bayi/hizmet/dış ticaret/fason). */
  activities?: string[];
  /** İlgi skoru — beyan kesişimi değil, gerçek davranış. */
  matchScore: number;
  /** "Neden gösterildi" — ham sinyalden türetilir, model metninden değil. */
  matchReason?: string | null;
  /** %20 keşif kotasından geldi (skoru düşük ama yeni firma). */
  discovery?: boolean;
}

/**
 * Perf turu (denetim P10): `enabled` eklendi. Bu sorgu YALNIZ "Keşfet"
 * sekmesinde kullanılıyor ve hiçbir sekme rozetini beslemiyor, ama sayfa
 * açılışında koşulsuz koşuyordu — kullanıcı Keşfet'e hiç girmese bile
 * kategori-eşleşmeli dizin taraması (60 firma + skorlama) çalışıyordu.
 * Sekme rozetlerini besleyen sorgular (connections/incoming/outgoing/
 * referral) açılışta kalır; onlar gerçekten gerekli.
 */
export function useDiscover(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["company-connections", "discover"],
    queryFn: async () => {
      const { data } = await companyApi.get<{
        locked: boolean;
        companies: DiscoverCompany[];
      }>("/company/connections/discover");
      return data;
    },
  });
}

export function useInviteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rothernId: string) => {
      const { data } = await companyApi.post<{ targetName: string }>(
        "/company/connections/invite",
        { rothernId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-connections"] });
      // Profil/arama kartlarındaki bağlantı durumu da bayatlamasın.
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export interface BlockedCompany {
  company: ConnectionCompany;
  createdAt: string;
}

export function useBlocks() {
  return useQuery({
    queryKey: ["company-blocks"],
    queryFn: async () => {
      const { data } = await companyApi.get<BlockedCompany[]>(
        "/company/blocks",
      );
      return data;
    },
  });
}

export function useBlockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rothernId,
      reason,
    }: {
      rothernId: string;
      reason?: string;
    }) => {
      const { data } = await companyApi.post<{ name: string }>(
        "/company/blocks",
        { rothernId, reason },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-blocks"] });
      qc.invalidateQueries({ queryKey: ["company-connections"] });
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export function useUnblockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data } = await companyApi.delete(`/company/blocks/${companyId}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-blocks"] });
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export function useDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const { data } = await companyApi.post(
        `/company/connections/${connectionId}/disconnect`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-connections"] });
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export function useRespondInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      connectionId,
      action,
    }: {
      connectionId: string;
      action: "accept" | "reject";
    }) => {
      const { data } = await companyApi.post(
        `/company/connections/${connectionId}/${action}`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-connections"] }),
  });
}
