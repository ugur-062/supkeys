// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeCoverImage } from "../safe-cover-image";

/**
 * Kapak ilk kareden görünür (LCP hidrasyona bağlı değil — yayın denetimi
 * Bölüm 11), kırık görselde ikon yerine logo yedeği.
 */
describe("SafeCoverImage", () => {
  it("ilk karede görünür + öncelikli; alt yüklenene dek boş, yüklenince gerçek metin", () => {
    const { container } = render(<SafeCoverImage src="/c.webp" alt="Firma kapağı" />);
    const img = container.querySelector("img")!;
    expect(img.className).not.toMatch(/opacity-0/);
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("alt")).toBe("");
    fireEvent.load(img);
    expect(screen.getByAltText("Firma kapağı")).toBeInTheDocument();
  });
  it("kırık görselde logo yedeğine düşer", () => {
    const { container } = render(<SafeCoverImage src="/yok.webp" alt="Firma kapağı" logoSrc="/logo.png" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector('img[src="/logo.png"]')).not.toBeNull();
  });
});
