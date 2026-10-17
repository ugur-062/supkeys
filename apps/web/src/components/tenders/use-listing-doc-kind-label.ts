"use client";

import { useTranslations } from "next-intl";
import type { ListingDocKind } from "@/hooks/use-listing-documents";

/**
 * Talep belgesi bölümünün adı — TEK sözlük `web.domain.listingDocKind.<KOD>`.
 * Yeni talepteki `StagedDocuments` ile düzenlemedeki / talep sayfasındaki
 * `FilesTab` aynı seçiciyi çizer; eskiden ikisi ayrı sözlük okuyordu ve RU'da
 * aynı liste "Прочее" / "Другое", "Приложение / Чертёж" / "Приложение /
 * чертёж" diye ayrışıyordu (mobil denetim fix3 r5-requests#new2).
 * Katalogda olmayan kod olduğu gibi döner.
 */
export function useListingDocKindLabel(): (kind: ListingDocKind | string) => string {
  const t = useTranslations("web.domain.listingDocKind");
  return (kind) => (t.has(kind as never) ? t(kind as never) : kind);
}

/**
 * Bölüm seçicisinin (ekranda görünmez, `sr-only`) etiketi — iki seçici aynı
 * anahtarı okur (`web.domain.listingDocKindField`; RU'da "Раздел для файла" /
 * "Раздел файла" diye ayrışıyordu, mobil denetim fix3 r5-requests).
 */
export function useListingDocKindFieldLabel(): string {
  return useTranslations("web.domain")("listingDocKindField");
}
