import type { AiHistoryTurn } from "../providers/ai-provider.interface";

/**
 * Faz AI-2 — kayan pencere + özetleme saf mantığı (test edilebilir).
 *
 * Son WINDOW_TURNS tur (kullanıcı+asistan çifti) tam tutulur; taşan en eski
 * turlar BİR KEZ özetlenir (özet sonraki turlara taşınır, tekrar özetlenmez).
 * Sınırsız bağlam ~9M/100 tur eder; pencere ~2M'de sabitler.
 */

export const WINDOW_TURNS = 8;
/** Bu tur sayısından sonra "yeni sohbet başlat" önerilir. */
export const SUGGEST_NEW_CHAT_AFTER = 35;

export interface StoredMessage {
  seq: number;
  role: "USER" | "ASSISTANT";
  content: string;
}

export interface WindowPlan {
  /** Modele gidecek geçmiş turlar (özet mesajı dahil, en eski önce). */
  history: AiHistoryTurn[];
  /** Özetlenmesi gereken taşan mesajlar (boşsa özetleme yok). */
  toSummarize: StoredMessage[];
  /** Özet bu seq'e kadar kapsayacak (özetleme yapılırsa yazılacak değer). */
  newSummarizedThroughSeq: number;
}

/**
 * Pencere planı: mevcut özet + saklı mesajlardan modele gidecek `history`'yi ve
 * (varsa) özetlenecek taşan mesajları hesaplar. `messages` seq'e göre ARTAN sıralı
 * olmalı; `summarizedThroughSeq`'e kadar olanlar zaten özete dahildir.
 */
export function planWindow(
  messages: StoredMessage[],
  summary: string | null,
  summarizedThroughSeq: number,
): WindowPlan {
  // Henüz özetlenmemiş mesajlar (özet zaten eski olanları kapsıyor).
  const fresh = messages.filter((m) => m.seq > summarizedThroughSeq);

  // Pencereye sığan son WINDOW_TURNS tur = son 2×WINDOW_TURNS mesaj.
  const windowSize = WINDOW_TURNS * 2;
  const inWindow = fresh.slice(-windowSize);
  const overflow = fresh.slice(0, Math.max(0, fresh.length - windowSize));

  const history: AiHistoryTurn[] = [];
  // Mevcut özet (varsa) pencerenin başında bir "user" bağlam mesajı olarak.
  if (summary && summary.trim() !== "") {
    history.push({
      role: "user",
      parts: [{ text: `[Önceki konuşma özeti]\n${summary.trim()}` }],
    });
  }
  for (const m of inWindow) {
    history.push({
      role: m.role === "USER" ? "user" : "model",
      parts: [{ text: m.content }],
    });
  }

  const newSummarizedThroughSeq =
    overflow.length > 0
      ? overflow[overflow.length - 1]!.seq
      : summarizedThroughSeq;

  return { history, toSummarize: overflow, newSummarizedThroughSeq };
}
