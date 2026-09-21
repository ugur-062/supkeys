// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AudienceOnly, AudienceProvider, AudienceSwitch } from "../audience-switch";

/**
 * ALICIYIM / TEDARİKÇİYİM (2026-09-07) — anasayfanın yüzünü seçen anahtar.
 * Sunucu HER ZAMAN TEDARİKÇİ yüzünü basar (2026-09-21 varsayılan; hidrasyon
 * kuralı); tercih istemcide okunur ve `localStorage`ta saklanır.
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
  it("varsayılan TEDARİKÇİ (2026-09-21): talepler görünür, ürünler gizli; sıra Tedarikçiyim · Alıcıyım", () => {
    render(<Page />);
    expect(screen.getByRole("radio", { name: "Tedarikçiyim" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Açık alım talepleri")).toBeVisible();
    expect(screen.getByText("Ürünler bölümü")).not.toBeVisible();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Tedarikçiyim", "Alıcıyım"]);
  });

  it("alıcı seçilince ürünler görünür, talepler gizlenir", async () => {
    const u = userEvent.setup();
    render(<Page />);
    await u.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    expect(screen.getByText("Ürünler bölümü")).toBeVisible();
    expect(screen.getByText("Açık alım talepleri")).not.toBeVisible();
  });

  it("tercih saklanır: ikinci gelişte alıcı yüzü açılır", async () => {
    const u = userEvent.setup();
    const { unmount } = render(<Page />);
    await u.click(screen.getByRole("radio", { name: "Alıcıyım" }));
    unmount();

    render(<Page />);
    expect(await screen.findByText("Ürünler bölümü")).toBeVisible();
  });

  it("iki tarafın içeriği de HTML'de durur (arama motoru ikisini de görür)", () => {
    render(<Page />);
    // Gizli taraf DOM'da var, yalnız `hidden`.
    expect(screen.getByText("Ürünler bölümü")).toBeTruthy();
  });
});
