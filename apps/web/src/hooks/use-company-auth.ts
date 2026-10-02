"use client";

import { localizePath } from "@/i18n/href";
import { useLocale } from "next-intl";
import { pickLocale } from "@rothern/i18n";
import { runtimeLocale } from "@/i18n/runtime";

import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { bindSessionOwner, clearTenantSessionData } from "@/lib/company-auth/tenant-storage";
import type {
  CompanyLoginResponse,
  CompanyMeResponse,
  CompanySignupInput,
} from "@/lib/company-auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useCompanyAuth() {
  const user = useCompanyAuthStore((s) => s.user);
  const company = useCompanyAuthStore((s) => s.company);
  return {
    user,
    company,
    // Oturum httpOnly cookie'de; `user` varlığı istemci-taraflı "giriş yapıldı".
    isAuthenticated: !!user,
  };
}

/**
 * İzinler bu sayfa yüklemesinde sunucudan tazelendi mi (arayüz testi D-299)?
 * Kalıcı anlık görüntü (`store.ts`) anlık boyama içindir; izni kaldırılmış
 * kullanıcıda bayat kalır. İzne bağlı İSTEK atan yüzeyler (panel içeriği,
 * rozetler, canlı kartlar) bunu bekler; `/me` hata verirse true döner
 * (anlık görüntü bilinen en iyi durum — sayfa kilitli kalmaz).
 */
export function useCompanyPermissionsSynced(): boolean {
  return useCompanyAuthStore((s) => s.permissionsSynced);
}

/** Rol kontrolü — kullanıcının verilen role sahip olup olmadığı. */
export function useHasRole(role: string): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  return !!user?.roles.includes(role as never);
}

/**
 * Efektif izin kontrolü — backend'in hesapladığı (rol + override + sahiplik)
 * izin kümesini kullanır; sahibin verdiği izin ekleri UI'da da açılır.
 * Faz R: eski "permissions yoksa Kurucu/Yönetici→true" fallback'i KALDIRILDI —
 * SAHIP artık işlem izni taşımaz, o varsayım yanlış butonlar açardı. Bayat
 * önbellekte kapı kapalı kalır; /me yenilenince doğru küme gelir.
 */
export function useHasCompanyPermission(permission: string): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  if (!user?.permissions) return false;
  return user.permissions.includes(permission);
}

export type CompanyLoginResult =
  | CompanyLoginResponse
  | { twoFactorRequired: true; method?: "email" | "authenticator" };

export function useCompanyLogin() {
  const queryClient = useQueryClient();
  const uiLocale = useLocale();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      code?: string;
      rememberMe?: boolean;
    }) => {
      const { data } = await companyApi.post<CompanyLoginResult>(
        "/company-auth/login",
        input,
      );
      return data;
    },
    // Dalga B-4: girişte önbellek TEMİZLENMİYORDU. Çıkışta temizleniyor ama
    // çıkış zaten sert yönlendirme yapıyor; asıl riskli yol oturumun 401 ile
    // düşmesi: kullanıcı SPA'da kalıyor, BAŞKA bir hesapla giriş yapıyor ve
    // TanStack Query önceki hesabın önbelleğini servis ediyor (ihale listesi,
    // teklifler, mesajlar). Girişte de sıfırdan başla.
    onSuccess: async (data) => {
      // i18n (2026-09-23, kullanıcı: "İngilizce seçtiğim hâlde panel Türkçe"):
      // giriş sayfasının dili AÇIK bir seçimdir. Hesabın kayıtlı dili farklıysa
      // hesaba yazılır — yoksa `LocaleUrlSync` paneli kayıtlı (eski) dile geri
      // atardı. Yönlendirmeden ÖNCE beklenir; hata girişi engellemez.
      if ("user" in data && pickLocale(data.user?.locale) !== uiLocale) {
        await companyApi.patch("/company-auth/me", { locale: uiLocale }).catch(() => undefined);
      }
      // Aynı sekmede önceki (başka) hesabın taslakları yeni hesaba geri yüklenmesin.
      if ("user" in data && data.user?.id) bindSessionOwner(data.user.id);
      queryClient.clear();
    },
  });
}

export function useCompanySignup() {
  return useMutation({
    mutationFn: async (input: CompanySignupInput) => {
      const { data } = await companyApi.post<{
        email: string;
        verificationRequired: true;
        // Kod e-postası gerçekten gönderildi mi? false → gönderim başarısız
        // (backend dürüst sinyal; UI "tekrar gönder" gösterir). Eski yanıtlarda
        // alan olmayabilir → default true (geriye uyumlu).
        emailSent?: boolean;
      }>("/company-auth/signup", input);
      return data;
    },
  });
}

/**
 * 6 haneli kodu doğrula. İlk doğrulamada oturum (token) döner; e-posta zaten
 * doğrulanmışsa güvenlik gereği token YOK → `{ alreadyVerified: true }`.
 */
export type VerifyEmailResult =
  | CompanyLoginResponse
  | { alreadyVerified: true };

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  const uiLocale = useLocale();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      code: string;
      // Giriş ekranındaki "Oturumumu açık bırak" — verilmezse (kayıt akışı)
      // API varsayılanı (kalıcı). false → oturum çerezi (derin denetim MU-23).
      rememberMe?: boolean;
    }) => {
      const { data } = await companyApi.post<VerifyEmailResult>(
        "/company-auth/verify-email",
        input,
      );
      return data;
    },
    // İlk doğrulama oturum açar → girişle aynı hijyen: dil eşitleme, sekme
    // sahibi bağlama, önceki hesabın önbelleğini temizleme.
    onSuccess: async (data) => {
      if (!("user" in data)) return;
      if (pickLocale(data.user?.locale) !== uiLocale) {
        await companyApi.patch("/company-auth/me", { locale: uiLocale }).catch(() => undefined);
      }
      if (data.user?.id) bindSessionOwner(data.user.id);
      queryClient.clear();
    },
  });
}

export function useResendEmailCode() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await companyApi.post<{ success: true }>(
        "/company-auth/resend-email-code",
        { email },
      );
      return data;
    },
  });
}

/**
 * Doğrulanmamış kaydın e-postasını düzelt — aynı hesabın adresi değişir, kod
 * yeni adrese gider (yeni kayıt açılmaz; derin denetim LU-22).
 */
export function useChangeSignupEmail() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string; newEmail: string }) => {
      const { data } = await companyApi.post<{
        email: string;
        verificationRequired: true;
        emailSent?: boolean;
      }>("/company-auth/signup/change-email", input);
      return data;
    },
  });
}

export function useSetCompanyAuth() {
  return useCompanyAuthStore((s) => s.setAuth);
}

// ── Token'lı ekip daveti (public — davetli henüz hesapsız) ──

export interface InvitationPreview {
  email: string;
  roles: string[];
  companyName: string;
  expiresAt: string;
}

const invitationPreviewKey = (token: string) => ["company-invitation", token] as const;

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: invitationPreviewKey(token),
    queryFn: async () => {
      // Sayfa geçersiz/kullanılmış daveti kendi kartında gösterir → global
      // toast yok (kart + toast aynı hatayı iki kez gösteriyordu).
      const { data } = await companyApi.get<InvitationPreview>(
        `/company/invitations/${token}`,
        { skipErrorToast: true },
      );
      return data;
    },
    enabled: !!token,
    retry: false,
    // Tek kullanımlık davetin önizlemesi: yeniden çekmek bilgi katmaz, kabulden
    // sonra ise "zaten kabul edilmiş" döner (arayüz testi FX-00 D-003).
    staleTime: Infinity,
  });
}

export interface AcceptInvitationInput {
  firstName: string;
  lastName: string;
  phone?: string;
  password: string;
  termsAccepted: boolean;
  mediationAccepted: boolean;
  kvkkAccepted: boolean;
  marketingConsent?: boolean;
  profileImprovementConsent?: boolean;
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AcceptInvitationInput) => {
      const { data } = await companyApi.post<CompanyLoginResponse>(
        `/company/invitations/${token}/accept`,
        input,
      );
      return data;
    },
    // Kabul oturum açar → girişle aynı hijyen (arayüz testi D-348): bu
    // tarayıcıda başka bir hesap açıksa onun önbelleği ve taslakları yeni
    // hesaba taşınmasın. (Yeni hesabın dili isteğin Accept-Language'ından,
    // yani davet sayfasında seçili dilden doğar — ayrıca yazmaya gerek yok.)
    onSuccess: (data) => {
      if (data.user?.id) bindSessionOwner(data.user.id);
      // Kabul sayfası yönlendirme bitene dek açık kalır: önizleme sorgusu
      // önbellekten silinirse hâlâ bağlı olan gözlemci onu yeniden çeker →
      // API "Bu davet zaten kabul edilmiş" (400) döner ve her kabulde panelde
      // hata toast'ı çıkardı (arayüz testi FX-00 D-003). Önizleme davetlinin
      // kendi verisi; temizlikten sonra geri konur, yeniden çekilmez.
      const key = invitationPreviewKey(token);
      const preview = queryClient.getQueryData<InvitationPreview>(key);
      queryClient.clear();
      if (preview) queryClient.setQueryData(key, preview);
    },
  });
}

/** Faz 5 — AB VAT numarası VIES ile doğrula. */
export function useViesCheck() {
  return useMutation({
    mutationFn: async (input: { countryCode: string; vatNumber: string }) => {
      const { data } = await companyApi.post<{
        valid: boolean;
        name: string | null;
        address: string | null;
        unavailable?: boolean;
      }>("/company-auth/vies-check", input);
      return data;
    },
  });
}

/** Faz 3 — doğrulama tamamsa premium'a (PAKET) geç. */
export function useUpgradePremium() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<{ ok: true; tier: string }>(
        "/company-auth/upgrade-premium",
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

/** Faz 2 — firma doğrulama sihirbazını tamamla. */
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data } = await companyApi.post<{ ok: true }>(
        "/company-auth/onboarding",
        input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-auth", "me"] }),
  });
}

/**
 * `skipErrorToast`: /me hatasını kendi kartında gösteren yüzey (onboarding
 * sihirbazı) global "Sunucu hatası" toast'ını kapatır — tek hata, tek mesaj
 * (arayüz testi webA-09 yeniden doğrulama; D-085 ile aynı ilke). Panel kabuğu
 * kart basmadığı için orada toast kalır.
 */
export function useCompanyMe(
  enabled = true,
  { skipErrorToast = false }: { skipErrorToast?: boolean } = {},
) {
  const user = useCompanyAuthStore((s) => s.user);
  const setMe = useCompanyAuthStore((s) => s.setMe);
  const markPermissionsSynced = useCompanyAuthStore(
    (s) => s.markPermissionsSynced,
  );
  const query = useQuery({
    queryKey: ["company-auth", "me"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyMeResponse>(
        "/company-auth/me",
        skipErrorToast ? { skipErrorToast: true } : undefined,
      );
      return data;
    },
    enabled: !!user && enabled,
    staleTime: 60 * 1000,
  });
  // Store senkronu render sonrası yan-etkiyle (queryFn içinde değil — StrictMode
  // çift-fetch veya cache okumasında setMe atlanmasını önler).
  useEffect(() => {
    if (!query.data) return;
    bindSessionOwner(query.data.user.id);
    setMe(query.data);
  }, [query.data, setMe]);
  // D-299: /me düşerse (kesinti) izinli yüzeyler sonsuza dek beklemesin.
  useEffect(() => {
    if (query.isError) markPermissionsSynced();
  }, [query.isError, markPermissionsSynced]);
  return query;
}

/** Çıkış isteğinin en uzun bekleneceği süre (ms). */
export const LOGOUT_WAIT_MS = 3000;

export function useCompanyLogout() {
  const clear = useCompanyAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return async () => {
    // Derin denetim MU-21: istek beklenmeden yönlendirilince tarayıcı bekleyen
    // logout isteğini iptal edebiliyordu → httpOnly oturum çerezi silinmeden
    // kalıyordu. Yanıt beklenir; API askıda kalırsa en çok LOGOUT_WAIT_MS.
    try {
      await Promise.race([
        companyApi.post("/company-auth/logout"),
        new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_MS)),
      ]);
    } catch {
      // Ağ/401 — istemci tarafı yine de temizlenir.
    } finally {
      clear();
      queryClient.clear();
      // Taslaklar, AI'ın bulduğu tedarikçi adresleri, davet ön doldurma, son aramalar.
      clearTenantSessionData();
      if (typeof window !== "undefined") {
        window.location.href = localizePath("/company/login", runtimeLocale());
      }
    }
  };
}
