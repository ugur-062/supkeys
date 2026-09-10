/**
 * Firma doğrulama durumu — TEK KAYNAK (2026-09-10).
 *
 * Daha önce üç kopya vardı: Ayarlar hub'ı (kart rozeti), Doğrulama sayfası
 * (STATUS_META) ve Firma Bilgileri ("Doğrulandı / Bekliyor" — UNVERIFIED ve
 * REJECTED firmaya da "Bekliyor" yazıyordu). Etiket ve kilit kuralı buradan
 * okunur; backend `company-profile.service` KYC kilidiyle BİREBİR.
 */
import type { StatusTone } from "@/components/ui/status-badge";

export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export type BadgeColor = "zinc" | "amber" | "green" | "red";

export const VERIFICATION_STATUS: Record<
  VerificationStatus,
  { label: string; color: BadgeColor; tone: StatusTone; hint: string }
> = {
  UNVERIFIED: {
    label: "Belge bekleniyor",
    color: "zinc",
    tone: "neutral",
    hint: "Doğrulama belgeleri henüz gönderilmedi.",
  },
  PENDING: {
    label: "İncelemede",
    color: "amber",
    tone: "pending",
    hint: "Belgeler ekibimizce inceleniyor.",
  },
  VERIFIED: {
    label: "Doğrulandı",
    color: "green",
    tone: "done",
    hint: "Firma belgelerle doğrulandı.",
  },
  REJECTED: {
    label: "Reddedildi",
    color: "red",
    tone: "failed",
    hint: "Belgelerde eksik/hata var; düzeltip yeniden gönderin.",
  },
};

/** Bilinmeyen/boş değerde UNVERIFIED'a düşer (eski kayıt / eksik alan). */
export function verificationMeta(status: string | null | undefined) {
  return VERIFICATION_STATUS[(status as VerificationStatus) in VERIFICATION_STATUS
    ? (status as VerificationStatus)
    : "UNVERIFIED"];
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
