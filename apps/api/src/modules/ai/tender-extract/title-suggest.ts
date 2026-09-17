/**
 * AI TALEP BAŞLIĞI (2026-09-17, kullanıcı kararı: "AI talep başlığı da
 * oluşturmalı"). Model kalem listesinden 4-10 sözcüklük, Türkçe, tırnaksız
 * bir başlık üretir; kod tarafı yalnız temizler ve sınırlar — uydurma
 * ölçü/sayı eklenmez, kalemde ne varsa o. Sonuç BAĞLAYICI DEĞİL: form alanına
 * yazılır, kullanıcı değiştirebilir.
 */
export const TITLE_MAX = 120;

export type TitleSuggestItem = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
};

export const TITLE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: { title: { type: "STRING" } },
  required: ["title"],
} as const;

export const TITLE_SYSTEM_PROMPT =
  "Sen bir B2B satın alma asistanısın. Verilen kalem listesinden satın alma talebi için KISA bir Türkçe başlık üret. " +
  "Kurallar: 4-10 sözcük; kalemlerde geçmeyen ölçü, marka, sayı veya vaat EKLEME; tırnak, emoji, nokta kullanma; " +
  "birden çok kalem varsa ana ürün grubunu adlandır (ör. 'Elektrik panosu ve şalt malzemeleri alımı'). " +
  "Yalnız JSON döndür: {\"title\": \"...\"}.";

export function buildTitlePrompt(items: TitleSuggestItem[]): string {
  const lines = items.slice(0, 40).map((i, n) => {
    const qty =
      i.quantity != null && Number.isFinite(i.quantity)
        ? ` — ${i.quantity}${i.unit ? ` ${i.unit}` : ""}`
        : "";
    return `${n + 1}. ${i.name}${qty}`;
  });
  return `Kalemler:\n${lines.join("\n")}\n\nBu talep için başlık öner.`;
}

/** Model çıktısını güvenli forma indirger; anlamsızsa null. */
export function sanitizeSuggestedTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let t = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/["“”'`«»]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/g, "")
    .trim();
  if (t.length > TITLE_MAX) t = t.slice(0, TITLE_MAX).replace(/\s+\S*$/, "").trim();
  if (t.length < 3 || !/\p{L}/u.test(t)) return null;
  return t;
}
