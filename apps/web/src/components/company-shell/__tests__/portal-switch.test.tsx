// @vitest-environment jsdom
/**
 * PORTAL DEĞİŞTİRME TUŞU — SÖZLEŞME (2026-09-15, kullanıcı kararı).
 *
 * Sol menüdeki segmentli pil TEK TUŞA indi ve üst çubuğa taşındı: üstünde iki
 * portalın ikonu ve aralarında değişim oku, tıklayınca ikisini açıklayan panel.
 *
 * Kilitlenen davranışlar, hepsi ya kullanıcı kararı ya da eski pilden DEVRALINAN
 * kural:
 *  · tek portallı üyede tuş HİÇ çizilmez (değiştirecek bir şey yok)
 *  · kilitli portal listede KALIR ve tıklanır — `PortalGuard` paket ekranını
 *    açar; gizlemek kullanıcıya neyi kaçırdığını söylemezdi
 *  · tuş nerede olduğunu da söyler (aktif portalın adı etiket olarak)
 *  · tuş diğer üst çubuk düğmeleriyle AYNI AİLEDEN (çerçevesiz, ikon + etiket)
 *    ama ikonu aktif portal renginde — çip "çok farklı" bulundu
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/company/portal-store", () => ({
  usePortalStore: (sel: (s: unknown) => unknown) => sel({ setLastPortal: vi.fn() }),
}));

import { PortalSwitch } from "../portal-switch";

const IKISI = ["satinalma", "satis"] as const;

describe("PortalSwitch", () => {
  it("tek portallı üyede ÇİZİLMEZ", () => {
    const { container } = render(
      <PortalSwitch active="satis" visiblePortals={["satis"]} available={["satis"]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("tuş nerede olduğunu söyler ve panel kapalı başlar", () => {
    render(
      <PortalSwitch active="satinalma" visiblePortals={IKISI} available={IKISI} />,
    );
    const btn = screen.getByRole("button", {
      name: /Panel değiştir — şu an Satınalma/,
    });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tuşta İKİ panelin ikonu görünür; aktif olan kendi renginde, diğeri gri", () => {
    const { rerender, container } = render(
      <PortalSwitch active="satinalma" visiblePortals={IKISI} available={IKISI} />,
    );
    const btn = screen.getByRole("button", { name: /Panel değiştir/ });
    // Çerçeveli çip değil (ikinci turda "çok farklı" bulundu).
    expect(btn.className).not.toMatch(/\bborder\b/);
    expect(btn).toHaveTextContent("Satınalma");
    const ikon = (p: string) => container.querySelector(`svg[data-portal-icon="${p}"]`)!;
    expect(ikon("satinalma").getAttribute("class")).toMatch(/text-blue-600/);
    expect(ikon("satis").getAttribute("class")).toMatch(/text-zinc-400/);

    rerender(<PortalSwitch active="satis" visiblePortals={IKISI} available={IKISI} />);
    // Satıştayken satınalma ikonu da GÖRÜNÜR ama soluk.
    expect(ikon("satinalma")).not.toBeNull();
    expect(ikon("satinalma").getAttribute("class")).toMatch(/text-zinc-400/);
    expect(ikon("satis").getAttribute("class")).toMatch(/text-emerald-600/);
    expect(screen.getByRole("button", { name: /Panel değiştir/ })).toHaveTextContent("Satış");
  });

  it("tıklayınca iki panel AÇIKLAMASIYLA listelenir", () => {
    render(
      <PortalSwitch active="satis" visiblePortals={IKISI} available={IKISI} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Panel değiştir/ }));

    const panel = screen.getByRole("dialog", { name: "Panel değiştir" });
    expect(panel).toBeInTheDocument();
    // Tek tuşun asıl işi: iki panelin NE OLDUĞUNU anlatmak.
    expect(screen.getByText(/Talep açar, teklif toplar/)).toBeInTheDocument();
    expect(screen.getByText(/Açık talepleri görür, teklif verir/)).toBeInTheDocument();
  });

  it("kilitli portal listede KALIR ve paket kapısına gider", () => {
    render(
      <PortalSwitch
        active="satis"
        visiblePortals={IKISI}
        available={["satis"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Panel değiştir/ }));

    // Gizlenmez: kullanıcı neyi kaçırdığını görmeli.
    expect(screen.getByLabelText("Paketle açılır")).toBeInTheDocument();
    expect(screen.getByText(/Gold paketiyle açılır/)).toBeInTheDocument();
    // Bağlantı yine portalın kendi yoluna gider — `PortalGuard` orada karşılar.
    const satinalma = screen.getByText(/Talep açar/).closest("a");
    expect(satinalma).toHaveAttribute("href", "/company/satinalma");
  });

  it("Escape paneli kapatır", () => {
    render(
      <PortalSwitch active="satis" visiblePortals={IKISI} available={IKISI} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Panel değiştir/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
