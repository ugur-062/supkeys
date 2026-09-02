/**
 * KATEGORİ KODU YARDIMCILARI — hiyerarşi KODDAN türer, ağaçta gezinmek yok.
 *
 * 8 haneli Ariba/UNSPSC kodu dört seviyeyi taşır:
 *   39000000  L1 segment
 *   39120000  L2 aile
 *   39122200  L3 sınıf
 *   39122215  L4 yaprak
 *
 * Bu yüzden bir düğümün atalarını bulmak için sorgu gerekmez — koddan kesilir.
 * Aynı mantık iki yerde kullanılıyordu (eşleştirme adayları + nitelik mirası);
 * buraya alındı ki ikisi ayrışmasın.
 */

/** Geçerli bir 8 haneli kategori kodu mu. */
export function isCategoryCode(code: string): boolean {
  return /^\d{8}$/.test(code);
}

/**
 * Kodun ATA ZİNCİRİ — kendisi DAHİL, segmentten yaprağa doğru sıralı.
 * Yinelenenler ayıklanır (L3 kodu verilirse L3 ve "kendisi" aynı olur).
 *
 * @example categoryAncestors("39122215")
 *   → ["39000000", "39120000", "39122200", "39122215"]
 * @example categoryAncestors("39120000")
 *   → ["39000000", "39120000"]
 */
export function categoryAncestors(code: string): string[] {
  if (!isCategoryCode(code)) return [];
  const chain = [
    `${code.slice(0, 2)}000000`,
    `${code.slice(0, 4)}0000`,
    `${code.slice(0, 6)}00`,
    code,
  ];
  return [...new Set(chain)];
}

/** Kodun seviyesi (1-4). Geçersiz kodda 0. */
export function categoryLevel(code: string): number {
  if (!isCategoryCode(code)) return 0;
  if (code.endsWith("000000")) return 1;
  if (code.endsWith("0000")) return 2;
  if (code.endsWith("00")) return 3;
  return 4;
}

/** Kodun segmenti (L1) — `39122215` → `39000000`. */
export function categorySegment(code: string): string | null {
  return isCategoryCode(code) ? `${code.slice(0, 2)}000000` : null;
}
