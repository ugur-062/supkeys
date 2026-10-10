// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { CategoryTile } from "../category-tile";

/**
 * KATEGORİ KARTI — uzun sözcük karttan taşmaz (son canlı kontrol 2026-10-10,
 * NEW-02).
 *
 * Kare kartın etiket kutusu 320 ve 640 px'te 112 px'e iner. Rusça tek sözcük
 * ("Сельскохозяйственное", 160 px) bölünemediği için kartın çerçevesini iki
 * yandan 12 px aşıyordu; üç etiket daha 1–1,5 px. Chromium'da ölçüldü (TR / EN /
 * RU, 320–1366 px): düzeltmeden sonra çerçeveyi ya da iç boşluğu aşan etiket
 * yok, etiket iki satırı geçmiyor. jsdom yerleşim hesaplamaz; kilitlenen şey
 * bunu sağlayan sınıflardır.
 */
const category = {
  id: "39000000",
  name: "Сельскохозяйственное и рыболовное оборудование",
  count: 0,
  imageSrc: "/categories/39000000.webp",
} as ShowcaseCategory;

const label = () => screen.getByText(category.name);
const classes = () => label().className.split(/\s+/);
/** Rusça hecelemenin sınırı: sözcük en az 14 harf · tireden önce en az 4 · sonra en az 4. */
const HYPHENATE_LIMIT = "[hyphenate-limit-chars:14_4_4]";

describe("CategoryTile — kare kart etiketi", () => {
  it("ikonlu kart (herkese açık anasayfa): etiket kutudan geniş olamaz, sığmayan sözcük bölünür", () => {
    render(<CategoryTile category={category} href="/k" variant="square" visual="icon" />);
    // Sütun düzeninde ortalanan etiket içeriği kadar genişler: üst sınır şart
    // (metin kutusu kartın iç genişliğini aşamaz — aşağıdaki CL-02 testi).
    expect(classes().some((c) => c.startsWith("max-w-"))).toBe(true);
    expect(classes()).toContain("break-words");
    // Rusçada tarayıcı hece sınırından tire ile böler (`<html lang="ru">`) —
    // yalnız uzun sözcüğü; kısa sözcük bütün olarak alt satıra iner.
    expect(classes()).toContain("[&:lang(ru)]:hyphens-auto");
    expect(classes()).toContain(HYPHENATE_LIMIT);
    // İki satır sınırı ve punto yerinde.
    expect(classes()).toEqual(expect.arrayContaining(["line-clamp-2", "text-[13px]/5"]));
  });

  it("fotoğraflı kart (panel vitrini): aynı kural", () => {
    render(<CategoryTile category={category} href="/k" variant="square" />);
    expect(classes()).toEqual(
      expect.arrayContaining(["break-words", "[&:lang(ru)]:hyphens-auto", HYPHENATE_LIMIT, "line-clamp-2"]),
    );
  });

  /* Kapanış kontrolü 2026-10-10, CL-03: `hyphenate-limit-chars: 13` kutuya SIĞAN
     13 harfli sözcükleri de bölüyor ("рас-пределения", "про-мышленного",
     "стро-ительству"), satır sonunda 2–3 harf bırakıyordu. Üç değerli biçim:
     sözcük en az 14 harf, tireden önce ve sonra en az 4 harf. Chromium'da
     çalışan derlemede ölçüldü (/ru, 320–1920 px): 13 harfli sözcükler bütün
     iner, 4 harften kısa parça kalmaz, taşan etiket yok. */
  it.each([
    ["ikonlu", "icon"],
    ["fotoğraflı", "photo"],
  ] as const)("%s kart: Rusça heceleme 14+ harfli sözcükte, tirenin iki yanında en az 4 harfle (CL-03)", (_ad, visual) => {
    render(<CategoryTile category={category} href="/k" variant="square" visual={visual} />);
    expect(classes()).toContain("[hyphenate-limit-chars:14_4_4]");
    // Tek değerli eski biçim (ön / son parça sınırı yok) geri gelmez; sınır tektir.
    expect(classes().filter((c) => c.startsWith("[hyphenate-limit-chars:"))).toEqual([HYPHENATE_LIMIT]);
  });

  /* Kapanış kontrolü 2026-10-10, CL-02: iki satırda kesilen etiketin "…"sı
     ortalanmış satırın sonundaki boşluktan sonra çizilir ve kutuyu 1–6 px aşar;
     `overflow: hidden` onu bir-iki noktaya kırpıyordu. Etiket iki yandan 8 px
     büyür (eksi kenar boşluğu + aynı iç boşluk), üst sınır da o kadar: metin
     kutusu aynı genişlikte kalır. Chromium'da ölçüldü (TR / EN / RU, 320–1920
     px, 14 472 etiket): satırlar, metnin yeri ve kart boyu değişmedi; "…" tam. */
  it("ikonlu kart: kesilen etiketin '…'sı için iki yanda 8 px yer; metin kutusu aynı genişlikte (CL-02)", () => {
    render(<CategoryTile category={category} href="/k" variant="square" visual="icon" />);
    // Üçü birlikte: biri eksikse metin kutusu daralır (satırlar değişir) ya da etiket karttan taşar.
    expect(classes()).toEqual(expect.arrayContaining(["-mx-2", "px-2", "max-w-[calc(100%+1rem)]"]));
    expect(classes()).not.toContain("max-w-full");
    // Kartın iç boşluğu 12 px: 8 px büyüyen etiket çerçevenin içinde kalır.
    const tile = screen.getByRole("link", { name: category.name });
    expect(tile.className.split(/\s+/)).toContain("px-3");
  });

  it("heceleme yalnız Rusçada: öteki dillerde sığan sözcüklerin sarması değişmez", () => {
    render(<CategoryTile category={category} href="/k" variant="square" visual="icon" />);
    expect(classes()).not.toContain("hyphens-auto");
  });

  it("etiket bağlantının adıdır: metin bölünse de ad tam okunur", () => {
    render(<CategoryTile category={category} href="/k" variant="square" visual="icon" />);
    expect(screen.getByRole("link", { name: category.name })).toHaveAttribute("href", "/k");
  });
});
