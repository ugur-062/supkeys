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
 *  · tuş diğer üst çubuk düğmelerinden AYRIŞIR: aktif portalın renginde
 *    çerçeveli çip (kullanıcı: "diğer tuşlardan farklı dursun")
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

  it("tuş AKTİF portalın renginde çerçeveli çiptir (gri ikon düğmesi değil)", () => {
    const { rerender } = render(
      <PortalSwitch active="satinalma" visiblePortals={IKISI} available={IKISI} />,
    );
    const btn = screen.getByRole("button", { name: /Panel değiştir/ });
    expect(btn.className).toMatch(/\bborder\b/);
    expect(btn.className).toMatch(/bg-blue-50/);
    expect(btn).toHaveTextContent("Satınalma");

    rerender(
      <PortalSwitch active="satis" visiblePortals={IKISI} available={IKISI} />,
    );
    const satis = screen.getByRole("button", { name: /Panel değiştir/ });
    expect(satis.className).toMatch(/bg-emerald-50/);
    expect(satis.className).not.toMatch(/blue/);
    expect(satis).toHaveTextContent("Satış");
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
