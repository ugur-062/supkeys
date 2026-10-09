import { describe, expect, it } from "vitest";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { isHiddenCategory } from "@rothern/shared";
import { toShowcaseRows } from "../category-showcase-rows";

/**
 * KATEGORİ VİTRİNİ SATIRLARI — anasayfa (herkese açık + satınalma) kartlarının
 * tek kurucusu. 2026-10-09 sahip kararı ("anasayfada olmayan kategori başka
 * yerde de gösterilmesin") bu listeye dayanır: vitrin görünür segmentlerin
 * TAMAMINI çizmeli, gizli segmenti hiç çizmemeli.
 */
const seg = (n: number): ShowcaseCategory => ({ id: `${String(n).padStart(2, "0")}000000`, name: `S${n}`, count: 0, imageSrc: null }) as ShowcaseCategory;
/** Gizli olmayan iki haneli öneklerden üretilmiş sahte segmentler (gerçek katalogdan bağımsız sayıda). */
const VISIBLE_POOL = Array.from({ length: 89 }, (_, i) => seg(11 + i)).filter((c) => !isHiddenCategory(c.id));
const segs = (count: number) => VISIBLE_POOL.slice(0, count);
const idsOf = (rows: ReturnType<typeof toShowcaseRows>) => rows.flatMap((r) => [r.promo.id, ...r.items.map((c) => c.id)]);

describe("toShowcaseRows", () => {
  it("27 görünür segment (bugün): 6 blok tavanında hepsi çizilir, hiçbiri düşmez", () => {
    const rows = toShowcaseRows(segs(27), 6);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.items.length)).toEqual([10, 10, 4]);
    expect(new Set(idsOf(rows)).size).toBe(27);
  });

  // Sayı 11'in katından bir fazlaysa son segment promo olarak alınıp ızgarası
  // boş kaldığı için blok atılıyor, o segment anasayfada hiç görünmüyordu.
  it.each([12, 23, 34])("%d segment: tek kalan segment kaybolmaz (önceki bloğun ızgarasına eklenir)", (count) => {
    const all = segs(count);
    const rows = toShowcaseRows(all, 6);
    expect(idsOf(rows).sort()).toEqual(all.map((c) => c.id).sort());
    expect(rows.at(-1)!.items.at(-1)!.id).toBe(all.at(-1)!.id);
  });

  it("tek segment: tek başına blok olarak çizilir", () => {
    const rows = toShowcaseRows(segs(1), 6);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.promo.id).toBe("11000000");
    expect(rows[0]!.items).toEqual([]);
  });

  it("satır tavanı dolunca artanlar son ızgaraya eklenir (kategori kaybolmaz)", () => {
    const rows = toShowcaseRows(segs(27), 2);
    expect(rows).toHaveLength(2);
    expect(new Set(idsOf(rows)).size).toBe(27);
  });

  it("gizli segment girdide gelse bile blok/kart olmaz (46, 77, 10)", () => {
    const hidden = ["46000000", "77000000", "10000000"].map((id) => ({ id, name: id, count: 9, imageSrc: null }) as ShowcaseCategory);
    const rows = toShowcaseRows([hidden[0]!, ...segs(5), hidden[1]!, hidden[2]!], 6);
    expect(idsOf(rows)).toEqual(segs(5).map((c) => c.id));
    // Gizli segment promo kartı da olamaz (listenin başında gelse bile).
    expect(rows[0]!.promo.id).toBe("11000000");
    expect(toShowcaseRows(hidden, 6)).toEqual([]);
  });
});
