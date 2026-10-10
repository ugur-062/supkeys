// @vitest-environment jsdom
/**
 * KATEGORİ VİTRİNİ — çizilen ızgara (canlı doğrulama 2026-10-09, PUB-01).
 *
 * Herkese açık anasayfa (ikonlu) ve panel `/company/satinalma` (fotoğraflı)
 * aynı bileşeni çizer. jsdom yerleşim hesaplamaz; kilitlenen şey sınıf
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
    // Panel vitrini (fotoğraflı) aynı ızgarayı çizer.
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
    // Yalnız uzun sözcük (13+ harf): "строительные" gibi sözcükler bölünmez,
    // başlık dört satıra çıkıp kartı uzatmaz.
    expect(cls).toContain("[hyphenate-limit-chars:13]");
    // Öteki dillerde heceleme açılmaz (sığan sözcüklerin sarması değişmesin).
    expect(cls).not.toContain("hyphens-auto");
  });

  it("tek sektör: tanıtım kartı tek başına, boş ızgara çizilmez", () => {
    const { container, grids } = draw(1, "icon");
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(grids).toHaveLength(0);
  });
});
