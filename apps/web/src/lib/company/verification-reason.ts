"use client";

import { useTranslations } from "next-intl";
import { parseVerificationReason } from "@rothern/shared";

/**
 * Doğrulama red gerekçesi → okunur metin (2026-09-27).
 *
 * Admin kararı "[KOD] isteğe bağlı not" biçiminde saklanır (tek kaynak shared
 * `verification-reason.ts`). Kod firmanın arayüz dilinde katalogdan
 * (`web.panel.settings.verificationReason.<KOD>`) çevrilir; admin notu olduğu
 * gibi eklenir. Kodsuz eski gerekçeler aynen döner.
 */
export function useVerificationReasonText(): (raw: string | null | undefined) => string | null {
  const t = useTranslations("web.panel.settings.verificationReason");
  return (raw) => {
    const { code, note } = parseVerificationReason(raw);
    if (!code) return note;
    const message = t(code);
    return note ? `${message} ${t("note", { note })}` : message;
  };
}
