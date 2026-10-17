// @vitest-environment jsdom
/**
 * Ürün formunun yapışkan eylem çubuğu — telefon düzeni (mobil denetim g09,
 * 2026-10-15).
 *
 * Kilit: telefonda ad + durum akışta kayan kartta, yalnız eylem şeridi
 * yapışkan (kök ve satır `max-sm:contents`); ad sütununun gerçek bir tabanı
 * var (eylemler adı ezmez, alt satıra kayar); uzun birincil metin telefonda
 * kısalır ama erişilebilir ad tam metindir; "Eksikler (N)" çipi taslakta da
 * ilk eksik bölüme götürür; menü etiketleri `DropdownLabel` içinde.
 */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductActionBar } from "../product-action-bar";

type Props = React.ComponentProps<typeof ProductActionBar>;

function renderBar(over: Partial<Props> = {}) {
  const props: Props = {
    name: "QA Tavan MU4J2FRA-50",
    status: "rejected",
    isNew: false,
    dirty: false,
    busy: false,
    canManage: true,
    primaryLabel: "Düzelt ve yeniden gönder",
    primaryShortLabel: "Yeniden gönder",
    onPrimary: vi.fn(),
    ...over,
  };
  render(<ProductActionBar {...props} />);
  return props;
}

describe("ProductActionBar — telefon düzeni (mobil denetim g09)", () => {
  it("telefonda yalnız eylem şeridi yapışkan; ad kartı ayrı, ad iki satıra kadar sarar; sm'de tek yapışkan kart", () => {
    renderBar();
    const title = screen.getByTestId("product-action-bar-title");
    const actions = screen.getByTestId("product-action-bar-actions");
    const h1 = screen.getByRole("heading", { level: 1, name: "QA Tavan MU4J2FRA-50" });
    // Ad sütunu eylemleri İÇERMEZ (eskiden aynı satırda `shrink-0` düğme adı 22 px'e eziyordu).
    expect(title.contains(actions)).toBe(false);
    expect(title.contains(h1)).toBe(true);
    // sm+: ad sütununun tabanı var → eylemler sığmayınca alt satıra kayar.
    expect(title.className).toMatch(/sm:flex-\[1_1_12rem\]/);
    expect(title.className).not.toMatch(/(^|\s)flex-1(\s|$)/);
    expect(h1.className).toMatch(/max-sm:line-clamp-2/);
    expect(h1.className).toMatch(/sm:truncate/);
    // Telefon: şerit yapışkan, kök ve satır kutusuz (şerit formun tamamına göre yapışır).
    expect(actions.className).toMatch(/max-sm:sticky/);
    expect(actions.className).toMatch(/max-sm:top-\(--topbar-h\)/);
    const row = actions.parentElement!;
    expect(row.className).toMatch(/max-sm:contents/);
    expect(row.parentElement!.className).toMatch(/max-sm:contents/);
    expect(row.parentElement!.className).toMatch(/sm:sticky/);
  });

  it("uzun birincil metin telefonda kısalır; erişilebilir ad TAM metin (görünen kısa metin adın içinde)", async () => {
    const props = renderBar();
    const primary = screen.getByRole("button", { name: "Düzelt ve yeniden gönder" });
    expect(within(primary).getByText("Yeniden gönder").className).toMatch(/sm:hidden/);
    expect(within(primary).getByText("Düzelt ve yeniden gönder").className).toMatch(/hidden sm:inline/);
    await userEvent.setup().click(primary);
    expect(props.onPrimary).toHaveBeenCalledTimes(1);
  });

  it("kısa metin uzunla aynıysa tek metin çizilir, aria-label konmaz", () => {
    renderBar({ status: "draft", primaryLabel: "Onaya gönder", primaryShortLabel: "Onaya gönder" });
    const primary = screen.getByRole("button", { name: "Onaya gönder" });
    expect(primary).not.toHaveAttribute("aria-label");
    expect(primary).toHaveTextContent(/^Onaya gönder$/);
  });

  it("kaydedilmemiş değişiklik: yazı kartta, şeritteki düğmede gizli (aria-hidden) nokta", () => {
    renderBar({ dirty: true });
    expect(screen.getByTestId("product-action-bar-title")).toHaveTextContent("Kaydedilmemiş değişiklik");
    const primary = screen.getByRole("button", { name: "Düzelt ve yeniden gönder" });
    const dot = primary.querySelector("span[aria-hidden]");
    expect(dot).not.toBeNull();
    expect(dot!.className).toMatch(/sm:hidden/);
  });

  it("'Eksikler (N)' çipi: sayıyı gösterir, tıklanınca onShowMissing; lg'de gizli (ray görünür); sayı 0 iken çizilmez", async () => {
    const onShowMissing = vi.fn();
    renderBar({ status: "draft", primaryLabel: "Onaya gönder", missingCount: 3, onShowMissing });
    const chip = screen.getByRole("button", { name: "Eksikler (3)" });
    expect(chip.className).toMatch(/lg:hidden/);
    expect(screen.getByTestId("product-action-bar-actions").contains(chip)).toBe(true);
    await userEvent.setup().click(chip);
    expect(onShowMissing).toHaveBeenCalledTimes(1);
  });

  it("eksik yokken çip çizilmez", () => {
    renderBar({ missingCount: 0, onShowMissing: vi.fn() });
    expect(screen.queryByRole("button", { name: /Eksikler/ })).toBeNull();
  });

  it("⋮ menüsü: her etiket DropdownLabel içinde (ikonlu satır diğerleriyle hizalı)", async () => {
    const user = userEvent.setup();
    renderBar({
      status: "published",
      primaryLabel: "Kaydet",
      primaryShortLabel: undefined,
      publicHref: "https://www.rothern.com/firma/a/urun/b",
      unpublish: vi.fn(),
      archive: vi.fn(),
    });
    await user.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Herkese açık sayfayı aç", "Vitrinden çek", "Arşivle"]);
    for (const item of items) {
      const label = item.querySelector('[data-slot="label"]');
      expect(label).not.toBeNull();
      expect(label!.textContent).toBe(item.textContent);
    }
  });
});

// Mobil denetim g09 doğrulama turu (masaüstü): not satırıyla 88 px'e çıkan
// çubuk, sabit 7.5rem ofsetli yapışkan rayın üst 24 px'ini örtüyordu. Çubuk
// gerçek yüksekliğini bildirir; form rayın ofsetini ondan hesaplar.
describe("ProductActionBar — yükseklik bildirimi", () => {
  function stubLayout(initial: number) {
    let height = initial;
    let fire: () => void = () => {};
    let observed: Element | null = null;
    const RO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) {
        fire = () => cb([], this as unknown as ResizeObserver);
      }
      observe(el: Element) {
        observed = el;
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ height, width: 960, top: 0, left: 0, right: 960, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect);
    return {
      setHeight: (h: number) => {
        height = h;
      },
      fire: () => act(() => fire()),
      observed: () => observed,
      restore: () => {
        rect.mockRestore();
        globalThis.ResizeObserver = RO;
      },
    };
  }

  it("kök kutunun yüksekliğini açılışta ve her değişimde bir kez bildirir", () => {
    const layout = stubLayout(64);
    try {
      const onHeightChange = vi.fn();
      renderBar({ onHeightChange, blockedNotice: true });
      expect(onHeightChange).toHaveBeenLastCalledWith(64);
      // Gözlenen öğe çubuğun KÖKÜ (yapışkan kart), iç satır değil.
      const root = screen.getByTestId("product-action-bar-title").parentElement!.parentElement!;
      expect(layout.observed()).toBe(root);
      layout.setHeight(88);
      layout.fire();
      expect(onHeightChange).toHaveBeenLastCalledWith(88);
      layout.fire();
      expect(onHeightChange).toHaveBeenCalledTimes(2);
    } finally {
      layout.restore();
    }
  });

  it("kutusu olmayan çubuk (telefonda `contents`, yükseklik 0) bildirilmez", () => {
    const layout = stubLayout(0);
    try {
      const onHeightChange = vi.fn();
      renderBar({ onHeightChange });
      layout.fire();
      expect(onHeightChange).not.toHaveBeenCalled();
    } finally {
      layout.restore();
    }
  });
});
