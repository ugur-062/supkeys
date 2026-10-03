import type { Locale } from "@rothern/i18n";
import { tApi } from "../i18n/i18n.service";
import { quantityDisplay } from "../i18n/unit-label";
import { formatInviteDeadline, formatInvitePlace, INVITE_ITEM_PREVIEW } from "./invite-delivery";

/**
 * KAYITLI FİRMAYA GİDEN TALEP E-POSTASININ ÖNİZLEMESİ (2026-09-27, kullanıcı:
 * "ücretsizse Silver'a geçmeye teşvik etmek için mail atalım, gelsin diye").
 * Bağlantılara giden davet ve kategori eşleşme duyurusu yalnız başlık +
 * numara taşıyordu; alıcı neyin istendiğini görmeden giriş yapmıyor, ücretsiz
 * firma kilitli talebin değerini göremiyordu. Artık ilk kalemler (ad + miktar
 * + birim), son teklif tarihi ve teslim yeri ALICININ DİLİNDE bilgi satırı
 * olarak gider.
 *
 * YALNIZ herkese açık talep sayfasının da gösterdiği olgular: kalem adı ve
 * miktarı, şehir + ülke, kapanış. Hedef fiyat, marka, şartname, belge, ticari
 * şart, tam adres ve alıcı kimliği ASLA (kategori duyurusu anonim kalır).
 */

export interface ListingPreviewSource {
  id: string;
  title: string;
  closesAt: Date | null;
  /** İlk kalemler (`lineNo` sırasıyla, en fazla `INVITE_ITEM_PREVIEW`). */
  items: { name: string; quantity: unknown; unit: string; unitCode: string | null }[];
  itemCount: number;
  place: { city: string | null; country: string | null } | null;
}

/** Talep başlığı + kalem adlarını alıcının diline çeviren okuma (içerik çevirisi). */
export type ListingLocalizer = (
  base: { title: string; items: { name: string }[] },
  id: string,
  locale: Locale,
) => Promise<{ title: string; items?: { name: string }[] } | undefined>;

export type PreviewRow = { label: string; value: string };

/** Tek dil için bilgi satırları. */
export async function listingPreviewRows(
  src: ListingPreviewSource,
  locale: Locale,
  localize?: ListingLocalizer,
): Promise<PreviewRow[]> {
  const shown = src.items.slice(0, INVITE_ITEM_PREVIEW);
  const loc = localize
    ? await localize({ title: src.title, items: shown.map((i) => ({ name: i.name })) }, src.id, locale).catch(
        () => undefined,
      )
    : undefined;
  const rows: PreviewRow[] = [];
  if (shown.length > 0) {
    const lines = shown.map(
      (it, i) =>
        `${loc?.items?.[i]?.name ?? it.name} — ${quantityDisplay(String(it.quantity), it.unitCode, it.unit, locale)}`,
    );
    const more = src.itemCount - shown.length;
    if (more > 0) {
      lines.push(tApi("api.notifications.listings.preview.more", { n: more }, locale));
    }
    rows.push({
      label: tApi("api.notifications.listings.preview.items", { count: src.itemCount }, locale),
      value: lines.join(" · "),
    });
  }
  if (src.closesAt) {
    rows.push({
      label: tApi("api.notifications.listings.preview.closesAt", undefined, locale),
      value: formatInviteDeadline(src.closesAt, locale),
    });
  }
  const place = src.place ? formatInvitePlace(src.place.city, src.place.country, locale) : null;
  if (place) {
    rows.push({ label: tApi("api.notifications.listings.preview.place", undefined, locale), value: place });
  }
  return rows;
}

/** Alıcıların dilleri için satırlar (dil başına bir kez hesaplanır). */
export async function listingPreviewRowsByLocale(
  src: ListingPreviewSource,
  locales: Iterable<Locale>,
  localize?: ListingLocalizer,
): Promise<Map<Locale, PreviewRow[]>> {
  const out = new Map<Locale, PreviewRow[]>();
  for (const l of new Set(locales)) out.set(l, await listingPreviewRows(src, l, localize));
  return out;
}
