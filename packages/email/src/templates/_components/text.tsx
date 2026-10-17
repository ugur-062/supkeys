import * as React from "react";

/**
 * Gövde metni için küçük tipografi yardımcıları (2026-10-04 e-posta tasarımı,
 * ikinci tur). Metnin kendisi değişmez — yalnız HTML'de nasıl kırıldığı:
 * düz metin sürümü ve kopyalanan değer aynı kalır.
 */

/** Talep/sipariş numarası ("ROT-000042", "ORD-2026-0187"). */
const ID_RE = /\b(?:ROT|ORD)-[0-9A-Z-]*[0-9A-Z]\b/g;

/**
 * Numaraları satır sonunda tireden bölünmez yapar (`white-space: nowrap`
 * span). U+2011 yerine span: kopyalanan ve aranan değer gerçek tireyle kalır.
 */
export function noBreakIds(text: string): React.ReactNode {
  ID_RE.lastIndex = 0;
  if (!ID_RE.test(text)) return text;
  ID_RE.lastIndex = 0;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(ID_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <span key={at} style={{ whiteSpace: "nowrap" }}>
        {m[0]}
      </span>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Düz metin değilse olduğu gibi; metinse numaralar bölünmez. */
export function inline(node: React.ReactNode): React.ReactNode {
  return typeof node === "string" ? noBreakIds(node) : node;
}

// Cümle sonu sayılmayan kısaltmalar ("Delta Yapı Ltd. Şti.", "No. 5", "т. д.").
const ABBR_END = /(?:^|[\s(])(?:Ltd|Şti|Inc|Co|Corp|No|Nr|vb|vs|örn|bkz|Dr|Mr|Mrs|Ms|St|Sn|т\.\s?д|т\.\s?п|г|ул|д)\.$/iu;

/**
 * Metni cümlelere böler: nokta/ünlem/soru işaretinden sonra boşluk ve BÜYÜK
 * harfle başlayan sözcük. Noktadan önceki karakter küçük harf, rakam ya da
 * kapanış işareti olmalı → "A.Ş. Rothern" gibi kısaltmalar bölünmez; bilinen
 * kısaltmalar (`ABBR_END`) yeniden birleştirilir.
 */
export function splitSentences(text: string): string[] {
  const parts = text.trim().split(/(?<=[\p{Ll}\d)"”»'’][.!?…])\s+(?=[\p{Lu}"“«(])/u);
  const out: string[] = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev !== undefined && ABBR_END.test(prev)) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out.filter((s) => s.length > 0);
}

/** Bu uzunluğu aşan paragraf telefonda 5+ satır olur → cümle gruplarına bölünür. */
const LONG_PARAGRAPH = 240;
/** Bölünen paragrafta bir grubun hedef üst sınırı (375 px'te ~4 satır). */
const CHUNK_TARGET = 210;

/**
 * Uzun paragrafı (tek cümle değilse) ~4 satırlık cümle gruplarına ayırır
 * (inceleme: "375 px'te 13-15 satırlık paragraf, önemli bilgi kayboluyor").
 * Kısa paragraf ve tek uzun cümle olduğu gibi kalır.
 */
export function paragraphChunks(text: string): string[] {
  if (text.length <= LONG_PARAGRAPH) return [text];
  const sentences = splitSentences(text);
  if (sentences.length < 2) return [text];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + 1 + s.length > CHUNK_TARGET) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
