/**
 * Firma doğrulama durumu — TEK KAYNAK (2026-09-10).
 *
 * Daha önce üç kopya vardı: Ayarlar hub'ı (kart rozeti), Doğrulama sayfası
 * (STATUS_META) ve Firma Bilgileri ("Doğrulandı / Bekliyor" — UNVERIFIED ve
 * REJECTED firmaya da "Bekliyor" yazıyordu). Etiket ve kilit kuralı buradan
 * okunur; backend `company-profile.service` KYC kilidiyle BİREBİR.
 *
 * i18n Faz 2: RENK/TON burada, METİN katalogda
 * (`web.panel.settings.verificationStatus.<DURUM>.{label,hint}`) — üç yüzey
 * de `useVerificationMeta()` ile okuyucunun dilinde çizer; Türkçe yedek
 * sözlük KALDIRILDI (tek kaynak katalog).
 */
import { useTranslations } from "next-intl";
import type { StatusTone } from "@/components/ui/status-badge";

export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export type BadgeColor = "zinc" | "amber" | "green" | "red";

export interface VerificationMeta {
  label: string;
  color: BadgeColor;
  tone: StatusTone;
  hint: string;
}

/** Durum → rozet rengi/tonu (metin katalogdan gelir). */
const VERIFICATION_TONE: Record<VerificationStatus, { color: BadgeColor; tone: StatusTone }> = {
  UNVERIFIED: { color: "zinc", tone: "neutral" },
  PENDING: { color: "amber", tone: "pending" },
  VERIFIED: { color: "green", tone: "done" },
  REJECTED: { color: "red", tone: "failed" },
};

/** Bilinmeyen/boş değerde UNVERIFIED'a düşer (eski kayıt / eksik alan). */
function normalizeStatus(status: string | null | undefined): VerificationStatus {
  return (status as VerificationStatus) in VERIFICATION_TONE
    ? (status as VerificationStatus)
    : "UNVERIFIED";
}

/**
 * Doğrulama durumu, okuyucunun dilinde — hub rozeti, Doğrulama ve Firma
 * Bilgileri aynı sözlüğü okur. Yalnız bileşen/hook gövdesinde çağrılır
 * (rules-of-hooks).
 */
export function useVerificationMeta(): (status: string | null | undefined) => VerificationMeta {
  const t = useTranslations("web.panel.settings.verificationStatus");
  return (status) => {
    const key = normalizeStatus(status);
    return {
      ...VERIFICATION_TONE[key],
      label: t(`${key}.label` as never),
      hint: t(`${key}.hint` as never),
    };
  };
}

/**
 * KYC kimlik kilidi — inceleme başladıktan (PENDING) veya onay verildikten
 * (VERIFIED) sonra firma adı, yasal unvan, MERSİS, sicil ve IBAN doğrulama
 * dosyasının parçasıdır; değiştirilemez. Backend aynı kuralı uygular
 * (Ayarlar formu ya da doğrudan istek → 400).
 */
export function isKycLocked(status: string | null | undefined): boolean {
  return status === "PENDING" || status === "VERIFIED";
}
