import { YES_NO_ANSWER_VALUES } from "@rothern/shared";

/**
 * YES_NO kalem sorusu cevabı dilden bağımsız sabit değerle saklanır
 * (`YES_NO_ANSWER_VALUES`, VERİ) — gösterimde aktif dile çevrilir (derin
 * denetim LU-21: EN/RU alıcı Türkçe cevap görüyordu). API raporu aynı
 * eşlemeyi `company-reports.service.ts` içinde yapar.
 */
export const YES_NO_STORED = YES_NO_ANSWER_VALUES;

/** Saklanan cevap → görünen etiket; YES_NO dışı / tanınmayan değer aynen döner. */
export function yesNoAnswerLabel(
  value: string,
  labels: { yes: string; no: string },
): string {
  if (value === YES_NO_STORED.yes) return labels.yes;
  if (value === YES_NO_STORED.no) return labels.no;
  return value;
}
