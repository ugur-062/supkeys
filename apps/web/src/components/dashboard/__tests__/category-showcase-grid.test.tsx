// @vitest-environment jsdom
/**
 * KATEGORİ VİTRİNİ — çizilen ızgara (canlı doğrulama 2026-10-09, PUB-01).
 *
 * Herkese açık anasayfa ve panel `/company/satinalma` aynı bileşeni, ikisi de
 * İKONLU çizer (panel 2026-10-10'a dek fotoğraflıydı — sahip kararı). Fotoğraflı
 * çizim (`visual="photo"`) kodda duruyor ama çağıranı yok; ızgarası aynı olduğu
 * için burada o da sınanır. jsdom yerleşim hesaplamaz; kilitlenen şey sınıf
 * mantığıdır: < 640 px iki sütun (390), 640–1023 px `sm` (768), ≥ 1024 px `lg`
 * (1024 / 1366 / 1920).
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { isHiddenCategory } from "@rothern/shared";
import { CategoryShowcaseRows, toShowcaseRows } from "../category-showcase-rows";

const seg = (n: number): ShowcaseCategory =>
  ({ id: `${String(n).padStart(2, "0")}000000`, name: `Sektör ${n}`, count: 0, imageSrc: null }) as ShowcaseCategory;
const VISIBLE_POOL = Array.from({ length: 89 }, (_, i) => seg(11 + i)).filter((c) => !isHiddenCategory(c.id));

function draw(count: number, visual: "photo" | "icon") {
  const rows = toShowcaseRows(VISIBLE_POOL.slice(0, count), 6);
  const { container } = render(
    <CategoryShowcaseRows rows={rows} hrefFor={(c) => `/k/${c.id}`} ctaLabel="Şimdi tedarikçi bulun" visual={visual} />,
  );
  return { container, grids: [...container.querySelectorAll("ul")] };
}

describe("CategoryShowcaseRows — blok ızgarası", () => {
  // 27, 2026-10-09'daki görünür sektör sayısıydı; bugünkü sayı (28) bir alttaki sınamada.
  it.each(["icon", "photo"] as const)("27 sektör (%s): üç blok, her biri 4 × 2 — her sektör bir kez çizilir", (visual) => {
    const { container, grids } = draw(27, visual);
    expect(container.querySelectorAll("section")).toHaveLength(3);
    expect(grids).toHaveLength(3);
    for (const ul of grids) {
      expect(ul.querySelectorAll("li")).toHaveLength(8);
      // 390 px: 2 sütun (4 satır) · 768 px: 4 + 4 · 1024 / 1366 / 1920 px: 4 × 2.
      expect(ul.classList.contains("grid-cols-2")).toBe(true);
      expect(ul.classList.contains("sm:grid-cols-4")).toBe(true);
      expect(ul.classList.contains("lg:grid-cols-4")).toBe(true);
      // Beş sütunlu ızgara 8 kartı 5 + 3 bölerdi.
      expect(ul.classList.contains("lg:grid-cols-5")).toBe(false);
      expect(ul.classList.contains("sm:grid-cols-3")).toBe(false);
      // İki satır tanıtım kartının yüksekliğini paylaşır (dolu blok görünümü).
      expect(ul.classList.contains("lg:content-start")).toBe(false);
    }
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(27);
    expect(hrefs).toHaveLength(27);
  });

  // 2026-10-10 (sahip kararı): 46 "İş Güvenliği ve Yangın Ekipmanları" geri
  // açıldı → anasayfa 28 sektör çizer. Üç blokta ilk blok 9 kart (5 + 4, dar
  // kartlar, bir boş yuva), öteki ikisi 4 × 2 çiziliyordu. Eşit blok tercihiyle
  // dört blok × (1 promo + 6 kart): hepsi 3 × 2, boş yuva yok.
  it.each(["icon", "photo"] as const)("28 sektör (%s): dört eşit blok, her biri 6 kart — 640 px'ten itibaren 3 × 2", (visual) => {
    const { container, grids } = draw(28, visual);
    expect(container.querySelectorAll("section")).toHaveLength(4);
    expect(grids.map((ul) => ul.querySelectorAll("li").length)).toEqual([6, 6, 6, 6]);
    for (const ul of grids) {
      // 390 px: 2 sütun (3 satır) · 768 px: 3 + 3 · 1024 / 1366 / 1920 px: 3 × 2.
      expect(ul.classList.contains("grid-cols-2")).toBe(true);
      expect(ul.classList.contains("sm:grid-cols-3")).toBe(true);
      expect(ul.classList.contains("lg:grid-cols-3")).toBe(true);
      // Dar kartlı beş sütun (Rusça adlar sözcük ortasından bölünüyordu) ve dört sütun yok.
      for (const cols of ["sm:grid-cols-4", "sm:grid-cols-5", "lg:grid-cols-4", "lg:grid-cols-5"]) {
        expect(ul.classList.contains(cols), cols).toBe(false);
      }
      // İki satır tanıtım kartının yüksekliğini paylaşır (dolu blok görünümü).
      expect(ul.classList.contains("lg:content-start")).toBe(false);
    }
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(28);
    expect(hrefs).toHaveLength(28);
  });

  // Görünür sektör sayısı gizleme / geri açma kararlarıyla 26–30 arasında oynar:
  // blok sayısı, bloklardaki kart sayısı ve geniş ekran (`lg`) sütunları.
  it.each([
    [26, [8, 8, 7], [4, 4, 4]],
    [27, [8, 8, 8], [4, 4, 4]],
    [28, [6, 6, 6, 6], [3, 3, 3, 3]],
    [29, [9, 9, 8], [5, 5, 4]],
    [30, [9, 9, 9], [5, 5, 5]],
  ])("%d sektör: bloklarda %j kart, geniş ekranda %j sütun — her sektör bir kez", (count, tiles, lgCols) => {
    const { container, grids } = draw(count, "icon");
    expect(grids.map((ul) => ul.querySelectorAll("li").length)).toEqual(tiles);
    expect(grids.map((ul) => [3, 4, 5].find((cols) => ul.classList.contains(`lg:grid-cols-${cols}`)))).toEqual(lgCols);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(count);
    expect(hrefs).toHaveLength(count);
  });

  // 2026-10-10 (sahip kararı): vitrin fotoğrafsızdır. `visual` verilmezse de
  // ikon çizilir — fotoğraf verisi (`imageSrc`) gelse bile <img> basılmaz.
  it("varsayılan çizim İKONLU: `visual` verilmeden fotoğraf basılmaz; fotoğraf yalnız açıkça istenirse", () => {
    const withPhotos = VISIBLE_POOL.slice(0, 7).map((c) => ({ ...c, count: 3, imageSrc: `/categories/${c.id}.webp` }));
    const rows = toShowcaseRows(withPhotos, 6);
    const byDefault = render(<CategoryShowcaseRows rows={rows} hrefFor={(c) => `/k/${c.id}`} ctaLabel="Şimdi tedarikçi bulun" />);
    expect(byDefault.container.querySelectorAll("img")).toHaveLength(0);
    expect(byDefault.container.innerHTML).not.toMatch(/categories(\/|%2F)/i);
    // Her kartta (tanıtım kartı dahil) çizgisel ikon var.
    for (const a of byDefault.container.querySelectorAll("a")) expect(a.querySelector("svg.lucide")).not.toBeNull();
    byDefault.unmount();
    // Fotoğraflı çizim açıkça istenince çalışır (kod silinmedi): 1 tanıtım + 6 kart.
    const photo = render(
      <CategoryShowcaseRows rows={rows} hrefFor={(c) => `/k/${c.id}`} ctaLabel="Şimdi tedarikçi bulun" visual="photo" />,
    );
    expect(photo.container.querySelectorAll("img")).toHaveLength(7);
    expect(photo.container.innerHTML).toMatch(/categories(\/|%2F)/i);
  });

  // Gözden geçirme R6-03: tablette 10 kart 3 sütunda 3 + 3 + 3 + 1 bölünüyordu.
  it("dolu blok (1 promo + 10 kart) 5 × 2 kalır — tablette (768 px) de 5 + 5", () => {
    const { grids } = draw(11, "icon");
    expect(grids).toHaveLength(1);
    expect(grids[0]!.querySelectorAll("li")).toHaveLength(10);
    expect(grids[0]!.classList.contains("lg:grid-cols-5")).toBe(true);
    expect(grids[0]!.classList.contains("sm:grid-cols-5")).toBe(true);
    expect(grids[0]!.classList.contains("sm:grid-cols-3")).toBe(false);
    expect(grids[0]!.classList.contains("sm:grid-cols-4")).toBe(false);
    expect(grids[0]!.classList.contains("lg:content-start")).toBe(false);
    // Fotoğraflı çizim (2026-10-10'dan beri çağıranı yok) aynı ızgarayı çizer.
    const photo = draw(11, "photo");
    expect(photo.grids[0]!.classList.contains("sm:grid-cols-5")).toBe(true);
    expect(photo.grids[0]!.classList.contains("sm:grid-cols-3")).toBe(false);
  });

  it("tek satırlık blok (4 kart): satır tanıtım kartının yüksekliğine gerilmez", () => {
    const { grids } = draw(5, "icon");
    expect(grids).toHaveLength(1);
    expect(grids[0]!.querySelectorAll("li")).toHaveLength(4);
    expect(grids[0]!.classList.contains("lg:grid-cols-4")).toBe(true);
    expect(grids[0]!.classList.contains("lg:content-start")).toBe(true);
  });

  it("12 sektör: iki blok × (1 promo + 5 kart) — 3 + 2 (dört sütunda 4 + 1 kalırdı)", () => {
    const { grids } = draw(12, "icon");
    expect(grids).toHaveLength(2);
    for (const ul of grids) {
      expect(ul.querySelectorAll("li")).toHaveLength(5);
      expect(ul.classList.contains("lg:grid-cols-3")).toBe(true);
      expect(ul.classList.contains("lg:content-start")).toBe(false);
    }
  });

  /* Son canlı kontrol 2026-10-10, NEW-02: 1024–1295 px'te tanıtım kartının
     başlık kutusu 224 px; Rusça "Производственные" (237 px) bölünemediği için
     sağ iç boşluğa giriyordu (24 yerine 11 px). Chromium'da ölçüldü (TR / EN /
     RU, 320–1920 px): düzeltmeden sonra sağ boşluk en az 24 px, kartın
     yüksekliği ve kısa sözcüklü başlıkların satırları aynı. jsdom yerleşim
     hesaplamaz; kilitlenen şey sınıflardır. */
  it.each(["icon", "photo"] as const)("tanıtım kartı başlığı (%s): sığmayan sözcük bölünür, Rusçada uzun sözcük hece sınırından", (visual) => {
    const { container } = draw(5, visual);
    const promo = container.querySelector("section > a")!;
    const title = [...promo.querySelectorAll("span")].find((el) => el.textContent === "Sektör 11" && el.children.length === 0)!;
    expect(title).toBeTruthy();
    const cls = title.className.split(/\s+/);
    expect(cls).toContain("break-words");
    expect(cls).toContain("[&:lang(ru)]:hyphens-auto");
    // Yalnız uzun sözcük (14+ harf), tirenin iki yanında en az 4 harf:
    // "строительные" gibi sözcükler bölünmez, başlık dört satıra çıkıp kartı
    // uzatmaz. Kapanış kontrolü CL-03: `13` iken "Производствен-ные
    // комплектую-щие" iki kez bölünüyordu (ikincisi kendi satırına sığar).
    expect(cls).toContain("[hyphenate-limit-chars:14_4_4]");
    expect(cls.filter((c) => c.startsWith("[hyphenate-limit-chars:"))).toHaveLength(1);
    // Öteki dillerde heceleme açılmaz (sığan sözcüklerin sarması değişmesin).
    expect(cls).not.toContain("hyphens-auto");
  });

  it("tek sektör: tanıtım kartı tek başına, boş ızgara çizilmez", () => {
    const { container, grids } = draw(1, "icon");
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(grids).toHaveLength(0);
  });
});
