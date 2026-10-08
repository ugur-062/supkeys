"use client";

import { localizePath } from "@/i18n/href";
import { useLocale } from "next-intl";
import { pickLocale } from "@rothern/i18n";
import { runtimeLocale } from "@/i18n/runtime";

import { companyApi } from "@/lib/company-auth/api";
import { isCompanyLoggingOut, markCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import type { ResendEmailCodeResult } from "@/lib/company-auth/resend-code";
import { clearSignupDraft } from "@/lib/company-auth/signup-draft";
import { companyRememberEnabled, useCompanyAuthStore } from "@/lib/company-auth/store";
import { bindSessionOwner, clearTenantSessionData } from "@/lib/company-auth/tenant-storage";
import type {
  CompanyLoginResponse,
  CompanyMeResponse,
  CompanySignupInput,
} from "@/lib/company-auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

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

/**
 * GİRİŞ SAYFASININ DİLİ HESABA YAZILIR — ve yanıt YENİ dille döner.
 *
 * i18n (2026-09-23, kullanıcı: "İngilizce seçtiğim hâlde panel Türkçe"): giriş
 * sayfasının dili AÇIK bir seçimdir; hesabın kayıtlı dili farklıysa hesaba
 * yazılır — yoksa `LocaleUrlSync` paneli kayıtlı (eski) dile geri atardı.
 *
 * Arayüz testi 2026-10 code-auth-6: yazma bekleniyor ama yanıtı atılıyordu.
 * Form depoyu GİRİŞ yanıtındaki eski dille (`user.locale: "tr"`) dolduruyor,
 * `LocaleUrlSync` adresi önce eski dile çeviriyor, `/me` gelince yeniden yeni
 * dile dönüyordu: iki fazladan tam yeniden bağlanma, arada eski dilde ekran ve
 * `/company` kökündeki tek seferlik kayıt niyeti ilk bağlanmada tüketilip
 * ikincide kayboluyordu. Yazma başarılıysa dönen kullanıcı yeni dili taşır;
 * başarısızsa giriş engellenmez, hesap eski dilinde kalır.
 */
async function withPageLocale<T extends CompanyLoginResponse>(data: T, uiLocale: string): Promise<T> {
  const wanted = pickLocale(uiLocale);
  if (!wanted || pickLocale(data.user?.locale) === wanted) return data;
  try {
    await companyApi.patch("/company-auth/me", { locale: wanted }, { skipErrorToast: true });
    return { ...data, user: { ...data.user, locale: wanted } };
  } catch {
    return data;
  }
}

export function useCompanyLogin() {
  const queryClient = useQueryClient();
  const uiLocale = useLocale();
  return useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      code?: string;
      rememberMe?: boolean;
    }): Promise<CompanyLoginResult> => {
      const { data } = await companyApi.post<CompanyLoginResult>(
        "/company-auth/login",
        input,
      );
      return "user" in data ? withPageLocale(data, uiLocale) : data;
    },
    // Dalga B-4: girişte önbellek TEMİZLENMİYORDU. Çıkışta temizleniyor ama
    // çıkış zaten sert yönlendirme yapıyor; asıl riskli yol oturumun 401 ile
    // düşmesi: kullanıcı SPA'da kalıyor, BAŞKA bir hesapla giriş yapıyor ve
    // TanStack Query önceki hesabın önbelleğini servis ediyor (ihale listesi,
    // teklifler, mesajlar). Girişte de sıfırdan başla.
    onSuccess: (data) => {
      if (!("user" in data)) return;
      // Aynı sekmede önceki (başka) hesabın taslakları yeni hesaba geri yüklenmesin.
      if (data.user?.id) bindSessionOwner(data.user.id);
      // Oturum açıldı: yarım kalmış kayıt taslağı (kod adımı dahil) kapanır.
      clearSignupDraft();
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
      // İlk doğrulama oturum açar → girişle aynı dil eşitlemesi (yanıt yeni
      // dille döner, bkz. `withPageLocale`).
      return "user" in data ? withPageLocale(data, uiLocale) : data;
    },
    // Girişle aynı hijyen: sekme sahibi bağlama, önceki hesabın önbelleğini
    // temizleme. Hesap doğrulandı (ya da zaten doğrulanmış) → kayıt taslağı
    // ve kod adımı kapanır.
    onSuccess: (data) => {
      clearSignupDraft();
      if (!("user" in data)) return;
      if (data.user?.id) bindSessionOwner(data.user.id);
      queryClient.clear();
    },
  });
}

/** Yanıtın anlamı: `lib/company-auth/resend-code.ts` `resendEmailCodeOutcome`. */
export function useResendEmailCode() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await companyApi.post<ResendEmailCodeResult>(
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

/**
 * ANLIK GÖRÜNTÜ YOK ≠ OTURUM YOK (arayüz testi 2026-10 login-1).
 *
 * "Oturumumu açık bırak" işaretsizken anlık görüntü sessionStorage'dadır, yani
 * SEKMEYE özeldir. Ctrl/orta tık, yer imi ya da e-postadaki bağlantıyla açılan
 * YENİ sekmede anlık görüntü yoktur ama oturum çerezi geçerlidir: nöbetçi
 * `/me`ye hiç sormadan giriş formuna atıyordu. Bu kanca o durumda `/me`yi BİR
 * KEZ yoklar; oturum varsa depoyu doldurur, yoksa "yok" der.
 *
 *  - `pending`: karar verilmedi (depo yükleniyor ya da yoklama sürüyor) —
 *    çağıran yönlendirmez, form çizmez.
 *  - `found`: oturum var (`user` dolu).
 *  - `none`: oturum yok.
 *
 * Yoklama YALNIZ "hatırla" kapalıyken ve bu sayfa yüklemesinde hiç kullanıcı
 * görülmediyse yapılır: "hatırla" açıkken anlık görüntü sekmeler arası
 * paylaşılır (yokluğu oturumsuzluktur), oturum bu sayfada düştüyse (401) ya da
 * kullanıcı çıkış yaptıysa sorulacak bir şey kalmamıştır. Sayfa yüklemesi
 * başına tek istek (modül düzeyi söz; StrictMode çift efekti dahil).
 */
export type CompanySessionProbe = "pending" | "found" | "none";

let sessionProbe: Promise<CompanyMeResponse | null> | null = null;

function probeCompanySession(): Promise<CompanyMeResponse | null> {
  sessionProbe ??= companyApi
    .get<CompanyMeResponse>("/company-auth/me", { skipErrorToast: true })
    .then(
      ({ data }) => (data?.user?.id ? data : null),
      () => null,
    );
  return sessionProbe;
}

/** Yalnız testler için: sayfa yüklemesi başına tek yoklama sözünü sıfırlar. */
export function resetCompanySessionProbe(): void {
  sessionProbe = null;
}

export function useCompanySessionProbe(): CompanySessionProbe {
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const setMe = useCompanyAuthStore((s) => s.setMe);
  const queryClient = useQueryClient();
  const hadUser = useRef(false);
  const [answer, setAnswer] = useState<"pending" | "none">("pending");

  useEffect(() => {
    if (!isHydrated) return;
    if (user) {
      hadUser.current = true;
      return;
    }
    if (hadUser.current || isCompanyLoggingOut() || companyRememberEnabled()) {
      setAnswer("none");
      return;
    }
    let alive = true;
    void probeCompanySession().then((me) => {
      if (!alive) return;
      if (!me) {
        setAnswer("none");
        return;
      }
      bindSessionOwner(me.user.id);
      // Kabuk `/me`yi yeniden çekmesin: yanıt sorgu önbelleğine de konur.
      queryClient.setQueryData(["company-auth", "me"], me);
      setMe(me);
    });
    return () => {
      alive = false;
    };
  }, [isHydrated, user, setMe, queryClient]);

  if (!isHydrated) return "pending";
  if (user) return "found";
  return answer;
}

/** Çıkış isteğinin en uzun bekleneceği süre (ms). */
export const LOGOUT_WAIT_MS = 3000;

export function useCompanyLogout() {
  const clear = useCompanyAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return async () => {
    // Açık çıkış: nöbetçi `?next=<son sayfa>` eklemesin — düz giriş sayfasına
    // bu kanca götürür (arayüz testi 2026-10 login-2, bkz. `logout-flag.ts`).
    markCompanyLoggingOut();
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
