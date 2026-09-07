/**
 * İLK YANIT SÜRESİ — TEK KAYNAK (2026-09-07).
 *
 * İki yer okur ve AYNI sayıyı vermek zorundadır:
 *  · İş Analizi (`company-views.service`) — firmanın kendi panelinde, anlık;
 *  · "Hızlı yanıt veren" süzgeci — gece cron'u `Company.medianReplyHours`e
 *    yazar, ürün dizini oradan süzer.
 *
 * Ayrışsalardı firma panelinde "ortalama 6 saat" görürken dizinde hızlı
 * sayılmayabilirdi; hangisinin doğru olduğunu kimse söyleyemezdi.
 *
 * ORTANCA (ortalama değil): tek bir unutulmuş talep (300 saat) ortalamayı
 * uçurur, ortancayı etkilemez. Yanıtlanmamış talepler hesaba GİRMEZ —
 * "ne kadar hızlı yanıtlıyor" sorusunun cevabı bu; "kaçını yanıtlıyor" ayrı
 * bir ölçü (İş Analizi'nde talep sayısı olarak zaten var).
 */

/** "Hızlı yanıt veren" eşiği (saat). Bir iş günü. */
export const FAST_REPLY_HOURS = 24;

/** Ölçüm penceresi — bundan eski talepler firmanın BUGÜNKÜ hızını anlatmaz. */
export const REPLY_WINDOW_DAYS = 90;

export interface InquiryReplyPair {
  createdAt: Date;
  replies: { createdAt: Date }[];
}

/**
 * Yanıtlanmış taleplerin ilk-yanıt gecikmelerinin ORTANCASI (saat).
 * Yanıtlanmış talep yoksa `null` — 0 DEĞİL: "ölçüm yok" ile "anında
 * yanıtlıyor" aynı şey değil ve süzgeç ilkini dışarıda bırakmalı.
 */
export function medianFirstReplyHours(inquiries: InquiryReplyPair[]): number | null {
  const hours = inquiries
    .filter((i) => i.replies[0])
    .map((i) => (i.replies[0]!.createdAt.getTime() - i.createdAt.getTime()) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  if (!hours.length) return null;
  return hours[Math.floor(hours.length / 2)]!;
}

/** Bir ondalık — panelde "6,4 saat" olarak okunur; kolonda da aynısı durur. */
export function roundReplyHours(h: number | null): number | null {
  return h == null ? null : Math.round(h * 10) / 10;
}
