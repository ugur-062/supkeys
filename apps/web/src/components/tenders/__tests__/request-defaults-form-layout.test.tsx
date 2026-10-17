// @vitest-environment jsdom
/**
 * Talep Şartları formu — yerleşim KAP genişliğine göre (mobil denetim v4new1).
 *
 * Form üç yerde dar kutuya düşüyor: hızlı talep sütunu (1024'te ödeme kutusu
 * 272 px), sağ raydaki Ticari şartlar paneli (304 px) ve Talep Şartları kartı
 * (1024 + kenar çubuğu: 336 px). Ekran kırılımına (`sm:`) bağlı ızgaralar bu
 * kutuları bölüp alanları ezdi: ödeme alt alanı 130 px (RU akreditif tipi
 * "По предъявле"), ana birim seçimi 146 px (RU "TRY — турецкая лира"
 * kesik), görünürlük kartları 107 px (RU ipucu ve TR "Bağlantılarım" taşıyor).
 * Izgaralar kendi sarmalayıcılarının (`@container`) genişliğine bakar.
 */
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { REQUEST_DEFAULTS_FALLBACK, type RequestDefaults } from "@rothern/shared";

vi.mock("@/hooks/use-company-addresses", () => ({ useAddresses: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ company: { country: "TR" } }) }));

import { RequestDefaultsForm } from "../request-defaults-form";

function renderForm(init: Partial<RequestDefaults>, props: Partial<Parameters<typeof RequestDefaultsForm>[0]> = {}) {
  return render(<RequestDefaultsForm value={{ ...REQUEST_DEFAULTS_FALLBACK, ...init }} onChange={() => {}} {...props} />);
}
const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
/** Ekran kırılımlı sınıf (sm:/md:/lg:/xl:/2xl:) — kap sorgusu (@…:) değil. */
const VIEWPORT_BREAKPOINT = /(^|\s)(sm|md|lg|xl|2xl):/;

describe("RequestDefaultsForm — kap genişliğine göre yerleşim", () => {
  it("ödeme alt alanları: akreditif tipi + vade aynı ızgarada, iki sütun yalnız kap ≥ 36 rem", () => {
    renderForm({ paymentCategory: "LETTER_OF_CREDIT", lcType: "USANCE", paymentDays: 60 }, { compact: true, bare: true, only: ["payment"] });
    const lc = screen.getByLabelText("Akreditif tipi");
    const days = screen.getByLabelText(/^Vade/);
    const grid = lc.closest(".grid")!;
    expect(grid).toBe(days.closest(".grid"));
    expect(classes(grid)).toEqual(expect.arrayContaining(["grid-cols-1", "@xl:grid-cols-2"]));
    expect(grid.getAttribute("class")).not.toMatch(VIEWPORT_BREAKPOINT);
    // Kap yalnız alt alanların sarmalayıcısı (bloğun tamamı değil).
    const container = grid.parentElement!;
    expect(classes(container)).toContain("@container");
    expect(container.contains(screen.getByLabelText("Ödeme koşulu"))).toBe(false);
  });

  it("tek alan (vade) da aynı kap ızgarasında; ekran kırılımlı sınıf yok", () => {
    renderForm({ paymentCategory: "DEFERRED", paymentDays: 30 }, { compact: true, bare: true, only: ["payment"] });
    const grid = screen.getByLabelText(/^Vade/).closest(".grid")!;
    expect(classes(grid)).toContain("@xl:grid-cols-2");
    expect(classes(grid.parentElement!)).toContain("@container");
  });

  it("para birimi ve görünürlük kartları da kap sorgusuyla; formun hiçbir yerinde ekran kırılımlı ızgara yok", () => {
    const { container } = renderForm({ paymentCategory: "ADVANCE", advancePercent: 100 });
    const currencyGrid = screen.getByLabelText("Ana para birimi").closest(".grid")!;
    expect(classes(currencyGrid)).toEqual(expect.arrayContaining(["grid-cols-1", "@xl:grid-cols-2"]));
    expect(classes(currencyGrid.parentElement!)).toContain("@container");
    const visibilityGrid = screen.getByRole("button", { name: /^Herkese açık/ }).parentElement!;
    expect(classes(visibilityGrid)).toEqual(expect.arrayContaining(["grid-cols-1", "@lg:grid-cols-3"]));
    expect(classes(visibilityGrid.parentElement!)).toContain("@container");
    for (const el of container.querySelectorAll("[class]")) expect(el.getAttribute("class")).not.toMatch(VIEWPORT_BREAKPOINT);
  });

  it("açılır listeli ülke seçici bir kap sorgusu sarmalayıcısının içinde değil (katman bağlamı)", () => {
    renderForm({ targetCountries: ["TR", "DE"] }, { only: ["scope"] });
    expect(screen.getByRole("combobox").closest(".\\@container")).toBeNull();
  });
});

describe("akreditif tipi etiketleri dar kutuya sığar", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
  const catalog = (locale: string) =>
    JSON.parse(readFileSync(join(repoRoot, "packages/i18n/src/messages", locale, "web.json"), "utf8")) as {
      domain: { lcType: Record<string, string> };
    };
  // RU SIGHT eskiden "По предъявлении (sight) — оплата при предъявлении
  // документов" idi (467 px): 1024'te tam genişlikteki 272 px'lik seçimde
  // bile kesiliyordu. Etiket kısa; açıklama cümlesi seçim kutusuna yazılmaz.
  it.each(["tr", "en", "ru"])("%s: her etiket ≤ 30 karakter", (locale) => {
    const labels = Object.values(catalog(locale).domain.lcType);
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label.length).toBeLessThanOrEqual(30);
  });
});
