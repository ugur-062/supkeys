import { describe, expect, it } from "vitest";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { MAPPED_SEGMENTS } from "@/lib/public/category-visual";
import { isHiddenCategory } from "@rothern/shared";
import { showcaseGridShape, toShowcaseRows } from "../category-showcase-rows";

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
  // Canlı doğrulama PUB-01: 27 segment 11 + 11 + 5 bölünüyordu — son blokta beş
  // sütunlu ızgarada dört kart, bir boş yuva ve gerilmiş kartlar. (27, o günkü
  // görünür sektör sayısıydı; bugünkü sayı bir alttaki sınamada.)
  it("27 segment (2026-10-09'daki sayı): üç DENGELİ blok (1 promo + 8 kart), hepsi çizilir", () => {
    const rows = toShowcaseRows(segs(27), 6);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.items.length)).toEqual([8, 8, 8]);
    expect(new Set(idsOf(rows)).size).toBe(27);
  });

  // 2026-10-10 (sahip kararı): 46 geri açıldı → bugünkü görünür sektör sayısı 28.
  // Üç blokta 10 + 9 + 9 bölünüyordu: ilk blokta beş sütunda dokuz kart (bir boş
  // yuva, dar kartlar — Rusça adlar 1024–1072 px'te sözcük ortasından
  // bölünüyordu), öteki iki blok 4 × 2. Eşit blok tercihiyle dört blok ×
  // (1 promo + 6 kart): her blok 3 × 2, boş yuva yok, bloklar birbirinin aynı.
  it("28 görünür segment: dört EŞİT blok (1 promo + 6 kart), hepsi çizilir, her blok 3 × 2", () => {
    const rows = toShowcaseRows(segs(28), 6);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.items.length)).toEqual([6, 6, 6, 6]);
    expect(new Set(idsOf(rows)).size).toBe(28);
    // Üç sütun `sm` kırılımından itibaren (640 px+); iki satır tanıtım kartının boyunu paylaşır.
    for (const r of rows) expect(showcaseGridShape(r.items.length)).toEqual({ sm: 3, lg: 3, stretch: true });
  });

  // EŞİT BLOK TERCİHİ (2026-10-10) — görünür sektör sayısı gizleme / geri açma
  // kararlarıyla 26–30 arasında oynar. Kart sayıları blok blok (promo hariç).
  it.each([
    // En az blok (3) eşit bölmüyor, dört blok da bölmüyor → bugünkü hâli.
    [26, [8, 8, 7]],
    // Üç blok zaten eşit.
    [27, [8, 8, 8]],
    // Üç blok eşit değil (10 + 9 + 9), dört blok eşit → bir blok fazla.
    [28, [6, 6, 6, 6]],
    // 29 asal: hiçbir blok sayısı eşit bölmez → bugünkü hâli.
    [29, [9, 9, 8]],
    // Üç blok zaten eşit (3 × 10).
    [30, [9, 9, 9]],
  ])("%d görünür sektör: bloklardaki kart sayıları %j", (count, tiles) => {
    const all = segs(count);
    const rows = toShowcaseRows(all, 6);
    expect(rows.map((r) => r.items.length)).toEqual(tiles);
    // Görünür her sektör bir kez çizilir, sıra korunur.
    expect(idsOf(rows)).toEqual(all.map((c) => c.id));
  });

  // Kural yalnız BİR blok ileri bakar ve blok tavanını aşmaz.
  it("eşit blok tercihi: yalnız bir blok fazlası denenir, tavan aşılmaz", () => {
    // 25 = 5 × 5 eşit bölünür ama iki blok ileride: üç blok (9 + 8 + 8) kalır.
    expect(toShowcaseRows(segs(25), 6).map((r) => r.items.length)).toEqual([8, 7, 7]);
    // Tavan üç blokken 28 dörde çıkamaz: 10 + 9 + 9 (kategori düşmez).
    const capped = toShowcaseRows(segs(28), 3);
    expect(capped.map((r) => r.items.length)).toEqual([9, 8, 8]);
    expect(new Set(idsOf(capped)).size).toBe(28);
    // Varsayılan tavan da üçtür.
    expect(toShowcaseRows(segs(28)).map((r) => r.items.length)).toEqual([9, 8, 8]);
    // Tek blok her zaman "eşit"tir: 11 sektöre kadar blok eklenmez.
    for (let count = 1; count <= 11; count++) expect(toShowcaseRows(segs(count), 6), `${count} segment`).toHaveLength(1);
  });

  // Gerçek sayı paylaşılan kuraldan okunur (elle yazılmaz): eşleme tablosundaki
  // 58 segmentten gizli olmayanlar. Bugünkü katalogda 28'dir ve 46 (İş Güvenliği
  // ve Yangın Ekipmanları) aralarındadır → vitrin dört eşit blok çizer.
  it("gerçek katalog: 58 segmentin 28'i görünür; 46 vitrine girer, gizli dalı (4610) girdide gelse de kart olmaz; dört eşit blok", () => {
    const catalog = MAPPED_SEGMENTS.map((code) => ({ id: `${code}000000`, name: code, count: 0, imageSrc: null }) as ShowcaseCategory);
    expect(catalog).toHaveLength(58);
    const visible = catalog.filter((c) => !isHiddenCategory(c.id));
    const rows = toShowcaseRows([...catalog, { id: "46100000", name: "Hafif silahlar", count: 3, imageSrc: null } as ShowcaseCategory], 6);
    const ids = idsOf(rows);
    expect(ids).toEqual(visible.map((c) => c.id));
    expect(ids).toHaveLength(28);
    expect(ids).toContain("46000000");
    expect(ids).not.toContain("46100000");
    expect(ids).not.toContain("77000000");
    expect(rows.map((r) => r.items.length)).toEqual([6, 6, 6, 6]);
    // İki çağıran da (herkese açık anasayfa, satınalma paneli) bu çağrıyı yapar.
    expect(rows.every((r) => showcaseGridShape(r.items.length).lg === 3)).toBe(true);
  });

  it("her sayıda: sıra korunur, hiçbir segment düşmez / yinelenmez, bloklar en çok bir kart farklıdır", () => {
    const extraBlock: number[] = [];
    for (let count = 1; count <= VISIBLE_POOL.length; count++) {
      const all = segs(count);
      const rows = toShowcaseRows(all, 6);
      expect(idsOf(rows), `${count} segment`).toEqual(all.map((c) => c.id));
      const sizes = rows.map((r) => r.items.length);
      expect(Math.max(...sizes) - Math.min(...sizes), `${count} segment`).toBeLessThanOrEqual(1);
      // Gereken en az blok ya da (eşit bölüyorsa) bir fazlası; tavan altı blok.
      const minBlocks = Math.min(6, Math.ceil(count / 11));
      expect([minBlocks, minBlocks + 1], `${count} segment`).toContain(rows.length);
      expect(rows.length, `${count} segment`).toBeLessThanOrEqual(6);
      if (rows.length > minBlocks) {
        extraBlock.push(count);
        // Bir blok fazlası YALNIZ eşit bölüyorsa ve en az blok bölmüyorsa…
        expect(new Set(sizes).size, `${count} segment`).toBe(1);
        expect(count % minBlocks, `${count} segment`).not.toBe(0);
        // …ve bloklar iki satırlık ızgarayı koruyorsa (tek satıra düşen blok yok).
        expect(showcaseGridShape(sizes[0]!).stretch, `${count} segment`).toBe(true);
      } else if (minBlocks < 6 && count % minBlocks !== 0 && count % (minBlocks + 1) === 0) {
        // Eşit bölen bir blok fazlası REDDEDİLDİYSE tek nedeni tek satıra düşmesidir.
        expect(showcaseGridShape(count / (minBlocks + 1) - 1).stretch, `${count} segment`).toBe(false);
      }
      // Tavan dolmadıkça blok 1 promo + 10 kartı aşmaz.
      if (count <= 66) expect(Math.max(...sizes), `${count} segment`).toBeLessThanOrEqual(10);
    }
    // Kuralın blok eklediği sayıların tamamı (6 blok tavanı, blokta 10 kart).
    expect(extraBlock).toEqual([21, 28, 32, 35, 48, 54]);
  });

  // Blok eklenen her sayıda bloklar eşit ve ızgara derli toplu: iki satır, en çok
  // bir boş yuva.
  it.each([
    [21, 3, 6],
    [28, 4, 6],
    [32, 4, 7],
    [35, 5, 6],
    [48, 6, 7],
    [54, 6, 8],
  ])("%d sektör: %d eşit blok × (1 promo + %d kart), iki satır", (count, blocks, tiles) => {
    const rows = toShowcaseRows(segs(count), 6);
    expect(rows.map((r) => r.items.length)).toEqual(Array.from({ length: blocks }, () => tiles));
    const { sm, lg, stretch } = showcaseGridShape(tiles);
    expect(stretch).toBe(true);
    for (const cols of [sm, lg]) expect((cols - (tiles % cols)) % cols).toBeLessThanOrEqual(1);
  });

  // TEK SATIRA DÜŞÜRMEZ. 15 sektör üç blokta eşit bölünür (3 × (1 promo + 4 kart))
  // ama dört kart tek satırdır: tanıtım kartının (312–368 px) yanında 156 px'lik
  // bir satır kalır, altı boş (Chromium'da ölçüldü, 1366 px). Blok eklenmez.
  it("15 sektör: üç eşit blok kartları tek satıra düşürürdü → iki blok kalır (7 + 6 kart, ikisi de iki satır)", () => {
    const rows = toShowcaseRows(segs(15), 6);
    expect(rows.map((r) => r.items.length)).toEqual([7, 6]);
    expect(new Set(idsOf(rows)).size).toBe(15);
    for (const r of rows) expect(showcaseGridShape(r.items.length).stretch).toBe(true);
    // Reddedilen bölünme: blokta 4 kart tek satıra sığar, satır gerilmez.
    expect(showcaseGridShape(4)).toEqual({ sm: 4, lg: 4, stretch: false });
  });

  // Sayı 11'in katından bir fazlaysa son segment promo olarak alınıp ızgarası
  // boş kaldığı için blok atılıyor, o segment anasayfada hiç görünmüyordu.
  it.each([12, 23, 34])("%d segment: tek kalan segment kaybolmaz, kartsız blok da oluşmaz", (count) => {
    const all = segs(count);
    const rows = toShowcaseRows(all, 6);
    expect(idsOf(rows).sort()).toEqual(all.map((c) => c.id).sort());
    expect(rows.at(-1)!.items.at(-1)!.id).toBe(all.at(-1)!.id);
    expect(rows.every((r) => r.items.length > 0)).toBe(true);
  });

  it("tek segment: tek başına blok olarak çizilir", () => {
    const rows = toShowcaseRows(segs(1), 6);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.promo.id).toBe("11000000");
    expect(rows[0]!.items).toEqual([]);
  });

  it("blok tavanı dolunca kartlar bloklara eşit dağılır (kategori kaybolmaz, son blok şişmez)", () => {
    const rows = toShowcaseRows(segs(27), 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.items.length)).toEqual([13, 12]);
    expect(new Set(idsOf(rows)).size).toBe(27);
  });

  it("gizli segment girdide gelse bile blok/kart olmaz (92, 77, 10)", () => {
    const hidden = ["92000000", "77000000", "10000000"].map((id) => ({ id, name: id, count: 9, imageSrc: null }) as ShowcaseCategory);
    const rows = toShowcaseRows([hidden[0]!, ...segs(5), hidden[1]!, hidden[2]!], 6);
    expect(idsOf(rows)).toEqual(segs(5).map((c) => c.id));
    // Gizli segment promo kartı da olamaz (listenin başında gelse bile).
    expect(rows[0]!.promo.id).toBe("11000000");
    expect(toShowcaseRows(hidden, 6)).toEqual([]);
  });
});

/**
 * IZGARA BİÇİMİ — sütun sayısı ve satır yüksekliği bloğun kart sayısından
 * (PUB-01). Ekran genişlikleri sınıf mantığıyla: < 640 px iki sütun (390),
 * 640–1023 px `sm` (768), ≥ 1024 px `lg` (1024 / 1366 / 1920).
 */
describe("showcaseGridShape", () => {
  it("8 kart: geniş ekranda 4 × 2, tablette 4 + 4 (boş yuva yok), iki satır kartın yüksekliğini paylaşır", () => {
    expect(showcaseGridShape(8)).toEqual({ sm: 4, lg: 4, stretch: true });
  });

  // Gözden geçirme R6-03: tablette seçim yalnız 3 ile 4 arasındaydı; 10 kart
  // eşitlikte 3 sütuna düşüp 3 + 3 + 3 + 1 bölünüyordu (iki boş yuva, tek kart).
  it("10 kart: 5 × 2 (dolu blok) — tablette de 5 + 5", () => {
    expect(showcaseGridShape(10)).toEqual({ sm: 5, lg: 5, stretch: true });
  });

  it("geniş ekranda hiçbir blok iki satırı aşmaz; iki satırlık blokta son satırda en çok bir yuva boş kalır", () => {
    for (let tiles = 1; tiles <= 10; tiles++) {
      const { lg } = showcaseGridShape(tiles);
      expect(Math.ceil(tiles / lg), `${tiles} kart`).toBeLessThanOrEqual(2);
      if (tiles >= 5) expect((lg - (tiles % lg)) % lg, `${tiles} kart`).toBeLessThanOrEqual(1);
    }
    // 5–6 kart 3 sütun · 7–8 kart 4 sütun · 9–10 kart 5 sütun; tek satır 4 sütunda.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((tiles) => showcaseGridShape(tiles).lg)).toEqual([4, 4, 4, 4, 3, 3, 4, 4, 5, 5]);
    // Blok tavanı dolup blok 10 kartı aşarsa sütun 5'te kalır (kart düşmez, satır eklenir).
    expect(showcaseGridShape(13).lg).toBe(5);
  });

  // Tek satırlık blokta ızgara satırı tanıtım kartının bütün yüksekliğine
  // geriliyordu (dolu blokta 176 px olan kart 344 px çiziliyordu).
  it.each([1, 2, 3, 4])("%d kart (tek satır): satır kartın yüksekliğine GERİLMEZ", (tiles) => {
    expect(showcaseGridShape(tiles).stretch).toBe(false);
  });

  it.each([5, 6, 7, 8, 9, 10])("%d kart (iki satır): satırlar kartın yüksekliğini paylaşır", (tiles) => {
    expect(showcaseGridShape(tiles).stretch).toBe(true);
  });

  it("tablet: son satırda daha az boş yuva bırakan sütun sayısı; eşitlikte 3", () => {
    expect(showcaseGridShape(9).sm).toBe(3); // 3 × 3
    expect(showcaseGridShape(7).sm).toBe(4); // 4 + 3
    expect(showcaseGridShape(6).sm).toBe(3); // 3 + 3
    expect(showcaseGridShape(4).sm).toBe(4); // 4
  });

  it("tablet: 1–10 kartın sütun sayısı; 5 sütun yalnız kartları iki satıra bölüyorsa (beş kart 3 + 2 kalır)", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((tiles) => showcaseGridShape(tiles).sm)).toEqual([3, 3, 3, 4, 3, 3, 4, 4, 3, 5]);
    // Blok tavanı dolup blok 10 kartı aşarsa: 11 kart 3 + 3 + 3 + 2, 15 kart 3 × 5, 20 kart 4 × 5.
    expect([11, 15, 20].map((tiles) => showcaseGridShape(tiles).sm)).toEqual([3, 3, 4]);
  });
});

/**
 * GERÇEK ÇAĞIRANLARLA YÜRÜYÜŞ (gözden geçirme R6-03). Anasayfa ve satınalma
 * paneli `toShowcaseRows(liste, 6)` çağırır; görünür sektör sayısı gizleme /
 * geri açma kararlarıyla değişir. Her sayıda, her blokta, İKİ kırılımda da
 * (tablet `sm`, geniş `lg`): birden çok satıra bölünen ızgaranın son satırında
 * en çok bir yuva boş kalır ve hiçbir kart tek başına bir satırda kalmaz.
 * Eskiden yalnız `lg` denetleniyordu; `sm` 11, 21, 22, 31, 32 ve 33 sektörde
 * (10 kartlı blok) 3 + 3 + 3 + 1 çiziyordu.
 */
describe("vitrin ızgarası — 1..40 görünür sektör, tablet ve geniş ekran", () => {
  const lastRow = (tiles: number, cols: number) => {
    const rest = tiles % cols;
    return { rows: Math.ceil(tiles / cols), tiles: rest === 0 ? cols : rest, empty: (cols - rest) % cols };
  };

  it("çok satırlı blokta son satırda en çok bir boş yuva, tek başına kalan kart yok", () => {
    const tenTileBlocks: number[] = [];
    for (let count = 1; count <= 40; count++) {
      const blocks = toShowcaseRows(segs(count), 6);
      for (const [index, block] of blocks.entries()) {
        const tiles = block.items.length;
        if (tiles === 0) continue; // tek sektör: yalnız tanıtım kartı
        if (tiles === 10 && !tenTileBlocks.includes(count)) tenTileBlocks.push(count);
        const shape = showcaseGridShape(tiles);
        for (const [breakpoint, cols] of [["sm", shape.sm], ["lg", shape.lg]] as const) {
          const where = `${count} sektör, blok ${index + 1} (${tiles} kart), ${breakpoint} ${cols} sütun`;
          const last = lastRow(tiles, cols);
          if (last.rows === 1) {
            // Tek satıra sığan blok sola yaslı kısa satırdır (kart büyütülmez); boş
            // yuva yalnız en çok üç kartlı blokta kalır (toplam 2–4 sektör).
            if (last.empty > 0) expect(tiles, where).toBeLessThanOrEqual(3);
            continue;
          }
          expect(last.empty, where).toBeLessThanOrEqual(1);
          expect(last.tiles, where).toBeGreaterThan(1);
        }
        // Geniş ekranda iki satırı aşan blok yok.
        expect(lastRow(tiles, shape.lg).rows, `${count} sektör, blok ${index + 1}`).toBeLessThanOrEqual(2);
      }
    }
    // Yürüyüş kusurun görüldüğü blok boyutunu (10 kart) gerçekten kapsıyor.
    // 21 ve 32 artık listede yok: eşit blok tercihiyle (2026-10-10) 21 sektör
    // 3 × (1 + 6), 32 sektör 4 × (1 + 7) bölünür — 10 kartlı blok oluşmaz.
    expect(tenTileBlocks).toEqual([11, 22, 31, 33]);
  });
});
