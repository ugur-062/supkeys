// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AudienceOnly, AudienceProvider, AudienceSwitch } from "../audience-switch";

/**
 * ALICIYIM / TEDARİKÇİYİM (2026-09-07) — anasayfanın yüzünü seçen anahtar.
 * Sunucu HER ZAMAN alıcı yüzünü basar (hidrasyon kuralı); tercih istemcide
 * okunur ve `localStorage`ta saklanır.
 */
function Page() {
  return (
    <AudienceProvider>
      <AudienceSwitch />
      <AudienceOnly side="buyer">
        <p>Ürünler bölümü</p>
      </AudienceOnly>
      <AudienceOnly side="supplier">
        <p>Açık alım talepleri</p>
      </AudienceOnly>
    </AudienceProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("AudienceSwitch", () => {
  it("varsayılan ALICI: ürünler görünür, talepler gizli", () => {
    render(<Page />);
    expect(screen.getByRole("radio", { name: "Alıcıyım" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Ürünler bölümü")).toBeVisible();
    expect(screen.getByText("Açık alım talepleri")).not.toBeVisible();
  });

  it("tedarikçi seçilince talepler görünür, ürünler gizlenir", async () => {
    const u = userEvent.setup();
    render(<Page />);
    await u.click(screen.getByRole("radio", { name: "Tedarikçiyim" }));
    expect(screen.getByText("Açık alım talepleri")).toBeVisible();
    expect(screen.getByText("Ürünler bölümü")).not.toBeVisible();
  });

  it("tercih saklanır: ikinci gelişte tedarikçi yüzü açılır", async () => {
    const u = userEvent.setup();
    const { unmount } = render(<Page />);
    await u.click(screen.getByRole("radio", { name: "Tedarikçiyim" }));
    unmount();

    render(<Page />);
    expect(await screen.findByText("Açık alım talepleri")).toBeVisible();
  });

  it("iki tarafın içeriği de HTML'de durur (arama motoru ikisini de görür)", () => {
    render(<Page />);
    // Gizli taraf DOM'da var, yalnız `hidden`.
    expect(screen.getByText("Açık alım talepleri")).toBeTruthy();
  });
});
