// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardCarousel } from "../card-carousel";

/**
 * Karusel sözleşmesi: başlık + çıkış bağlantısı her zaman; OKLAR yalnız şerit
 * gerçekten kaydırılabiliyorsa. jsdom'da düzen yok (scrollWidth = clientWidth
 * = 0) → şerit kaydırılamaz sayılır ve ok ÇİZİLMEZ. Test tam da bunu kilitler:
 * çalışmayan bir ok basmak "bozuk" hissi verirdi.
 */
describe("CardCarousel", () => {
  it("başlık ve 'tüm ürünler' bağlantısı basılır", () => {
    render(
      <CardCarousel
        heading="Karadeniz Enerji ile keşfedilecek daha fazla ürün"
        link={{ href: "/firma/karadeniz", label: "Tüm ürünleri görüntüle (35)" }}
      >
        <li>kart</li>
      </CardCarousel>,
    );
    expect(
      screen.getByRole("heading", { name: "Karadeniz Enerji ile keşfedilecek daha fazla ürün" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tüm ürünleri görüntüle (35)" })).toHaveAttribute(
      "href",
      "/firma/karadeniz",
    );
  });

  it("kaydırılamayan şeritte ok düğmesi çizilmez", () => {
    render(
      <CardCarousel heading="Benzer ürünler">
        <li>kart</li>
      </CardCarousel>,
    );
    expect(screen.queryByRole("button", { name: "Sonraki ürünler" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Önceki ürünler" })).toBeNull();
  });
});
