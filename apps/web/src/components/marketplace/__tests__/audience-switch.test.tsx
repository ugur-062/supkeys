// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("AudienceSwitch — klavye (arayüz testi D-313)", () => {
  it("grup tek sekme durağı; ok tuşları seçimi ve odağı taşır", async () => {
    const u = userEvent.setup();
    render(<Page />);
    const supplier = screen.getByRole("radio", { name: "Tedarikçiyim" });
    const buyer = screen.getByRole("radio", { name: "Alıcıyım" });
    expect(supplier).toHaveAttribute("tabindex", "0");
    expect(buyer).toHaveAttribute("tabindex", "-1");

    await u.tab();
    expect(supplier).toHaveFocus();
    await u.keyboard("{ArrowRight}");
    expect(buyer).toHaveFocus();
    expect(buyer).toHaveAttribute("aria-checked", "true");
    expect(buyer).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("Ürünler bölümü")).toBeVisible();

    // Sondan başa sarar.
    await u.keyboard("{ArrowRight}");
    expect(supplier).toHaveFocus();
    expect(supplier).toHaveAttribute("aria-checked", "true");
    await u.keyboard("{ArrowLeft}");
    expect(buyer).toHaveFocus();
    await u.keyboard("{Home}");
    expect(supplier).toHaveFocus();
  });
});

describe("AudienceProvider — alıcı yüzündeki çapalar (arayüz testi O-118)", () => {
  function CategoryPage() {
    return (
      <AudienceProvider>
        <a href="/#kategoriler">Kategoriler</a>
        <AudienceOnly side="buyer">
          <div id="kategoriler">Kategori vitrini</div>
        </AudienceOnly>
        <AudienceOnly side="supplier">
          <p>Açık alım talepleri</p>
        </AudienceOnly>
      </AudienceProvider>
    );
  }
  let scrolled: string[] = [];
  beforeEach(() => {
    scrolled = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.id);
    });
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("`/#kategoriler` ile gelince yüz alıcıya geçer ve vitrin kaydırılır; tercih değişmez", async () => {
    window.history.replaceState(null, "", "/#kategoriler");
    render(<CategoryPage />);
    expect(await screen.findByText("Kategori vitrini")).toBeVisible();
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(scrolled).toContain("kategoriler");
    expect(window.localStorage.getItem("rothern.audience")).toBeNull();
  });

  it("aynı sayfadaki `/#kategoriler` bağlantısına basınca tedarikçi yüzünden alıcıya geçer", async () => {
    window.history.replaceState(null, "", "/");
    render(<CategoryPage />);
    expect(screen.getByText("Kategori vitrini")).not.toBeVisible();
    const link = screen.getByRole("link", { name: "Kategoriler" });
    link.addEventListener("click", (e) => e.preventDefault());
    await userEvent.setup().click(link);
    expect(screen.getByText("Kategori vitrini")).toBeVisible();
    expect(screen.getByText("Açık alım talepleri")).not.toBeVisible();
  });

  it("Ctrl/Cmd/Shift+tık (yeni sekme) mevcut sayfanın yüzünü değiştirmez", () => {
    window.history.replaceState(null, "", "/");
    render(<CategoryPage />);
    const link = screen.getByRole("link", { name: "Kategoriler" });
    link.addEventListener("click", (e) => e.preventDefault());
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
      fireEvent.click(link, mod);
    }
    expect(screen.getByText("Kategori vitrini")).not.toBeVisible();
    expect(screen.getByText("Açık alım talepleri")).toBeVisible();
  });
});
