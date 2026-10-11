// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProductGallery } from "../product-gallery";

describe("ProductGallery", () => {
  it("yüklenebilen 8 görselin hepsini gösterir (O-100: 6'da kesiyordu)", () => {
    const images = Array.from({ length: 8 }, (_, i) => `https://cdn.example.com/g${i}.webp`);
    render(<ProductGallery images={images} alt="Ürün" categoryIds={[]} />);
    expect(screen.getAllByRole("button", { name: /\. görseli göster/ })).toHaveLength(8);
  });

  it("7–8 görsel tek satırda kalır: şerit sarmaz, yatay kayar (oklar şeritle hizalı)", () => {
    const images = Array.from({ length: 8 }, (_, i) => `https://cdn.example.com/g${i}.webp`);
    render(<ProductGallery images={images} alt="Ürün" categoryIds={[]} />);
    const strip = screen.getAllByRole("button", { name: /\. görseli göster/ })[0].closest("ul") as HTMLElement;
    expect(strip.className).toContain("flex");
    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.className).not.toMatch(/grid-cols/);
    for (const li of Array.from(strip.children)) expect(li.className).toContain("shrink-0");
  });

  it("büyütme katmanı body'ye portal edilir ve Kapat düğmesi kapatır (O-015)", async () => {
    const u = userEvent.setup();
    const { container } = render(<ProductGallery images={["https://cdn.example.com/a.webp"]} alt="Ürün" categoryIds={[]} />);
    await u.click(screen.getByRole("button", { name: "Görseli büyüt" }));
    const dialog = screen.getByRole("dialog", { name: "Ürün" });
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    await u.click(screen.getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
