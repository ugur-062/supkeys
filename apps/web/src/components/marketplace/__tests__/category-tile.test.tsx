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

describe("CategoryTile — kare kart etiketi", () => {
  it("ikonlu kart (herkese açık anasayfa): etiket kutudan geniş olamaz, sığmayan sözcük bölünür", () => {
    render(<CategoryTile category={category} href="/k" variant="square" visual="icon" />);
    // Sütun düzeninde ortalanan etiket içeriği kadar genişler: üst sınır şart.
    expect(classes()).toContain("max-w-full");
    expect(classes()).toContain("break-words");
    // Rusçada tarayıcı hece sınırından tire ile böler (`<html lang="ru">`) —
    // yalnız uzun sözcüğü (13+ harf); kısa sözcük bütün olarak alt satıra iner.
    expect(classes()).toContain("[&:lang(ru)]:hyphens-auto");
    expect(classes()).toContain("[hyphenate-limit-chars:13]");
    // İki satır sınırı ve punto yerinde.
    expect(classes()).toEqual(expect.arrayContaining(["line-clamp-2", "text-[13px]/5"]));
  });

  it("fotoğraflı kart (panel vitrini): aynı kural", () => {
    render(<CategoryTile category={category} href="/k" variant="square" />);
    expect(classes()).toEqual(
      expect.arrayContaining(["break-words", "[&:lang(ru)]:hyphens-auto", "[hyphenate-limit-chars:13]", "line-clamp-2"]),
    );
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
