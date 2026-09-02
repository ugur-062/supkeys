import {
  categoryAncestors,
  categorySegment,
  isCategoryCode,
} from "@rothern/shared";

/**
 * İhale kategorilerinden (8-haneli UNSPSC kodları) tedarikçi-eşleşme adaylarını
 * türetir. Tedarikçinin ANA (segment) kategorisi veya ALT (family/class/commodity)
 * kategorisi ihaledekiyle örtüşürse eşleşir. Hem yayın-anı önerisi hem kapanış
 * hatırlatması bunu kullanır (drift olmasın).
 */
export function deriveCategoryMatchCandidates(tenderCategoryCodes: string[]): {
  segmentIds: string[];
  subCandidates: string[];
} {
  // Ata zinciri TEK KAYNAK: @rothern/shared `categoryAncestors`. Nitelik
  // mirası (CategoryAttribute) da aynı zinciri kullanıyor — ikisi ayrışırsa
  // "eşleşen kategori" ile "sorulan nitelik" farklı ağaçlar olurdu.
  const codes = tenderCategoryCodes.filter(isCategoryCode);
  const segmentIds = Array.from(
    new Set(codes.map((c) => categorySegment(c)).filter((c): c is string => !!c)),
  );
  // Segment (L1) ayrı döndüğü için alt adaylardan çıkarılır — eski davranış
  // birebir korunur (L2/L3/kendisi).
  const subCandidates = Array.from(
    new Set(
      codes.flatMap((c) => categoryAncestors(c).filter((a) => !a.endsWith("000000"))),
    ),
  );
  return { segmentIds, subCandidates };
}
