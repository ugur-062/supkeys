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
  const codes = tenderCategoryCodes.filter((c) => /^\d{8}$/.test(c));
  const segmentIds = Array.from(
    new Set(codes.map((c) => c.slice(0, 2) + "000000")),
  );
  const subCandidates = Array.from(
    new Set(
      codes.flatMap((c) => [c, c.slice(0, 6) + "00", c.slice(0, 4) + "0000"]),
    ),
  );
  return { segmentIds, subCandidates };
}
