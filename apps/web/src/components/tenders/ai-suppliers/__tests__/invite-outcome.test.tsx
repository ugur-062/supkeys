// @vitest-environment jsdom
/**
 * DAVET SONUCU ETİKETİ — durum bandı ve "E-postayla davet edilenler" bölümünün
 * tek kaynağı (canlı doğrulama 2026-10-09, AUTO-UI-6 / AUTO-UI-7).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AUTO_INVITE_OFF_REASON, InviteOutcome, WEAK_MATCH_REASON } from "../invite-outcome";

describe("InviteOutcome", () => {
  // AUTO-UI-6: hizayı çağıran veriyordu; vermeyen yüzeyde (durum bandı) alt
  // satıra inen rozet sola düşüyordu.
  it("rozet kabı çağıran sınıf vermese de sağa yaslanır; çağıranın sınıfı eklenir", () => {
    const view = render(<InviteOutcome invite="INVITED" />);
    const box = screen.getByText("Davet edildi").parentElement as HTMLElement;
    expect(box.classList.contains("ml-auto")).toBe(true);
    expect(box.classList.contains("text-right")).toBe(true);
    view.rerender(<InviteOutcome invite="INVITED" className="shrink-0" />);
    const again = screen.getByText("Davet edildi").parentElement as HTMLElement;
    expect(again.classList.contains("ml-auto")).toBe(true);
    expect(again.classList.contains("shrink-0")).toBe(true);
  });

  // AUTO-UI-7: alıcının kendi ayarı yüzünden düşen davet çıplak "iptal edildi" demez.
  it("otomatik arama kapatıldığı için düşen davet nedeni adıyla yazar; elle iptal ayrı cümledir", () => {
    const view = render(<InviteOutcome invite="NOT_SENT" reason={AUTO_INVITE_OFF_REASON} />);
    expect(screen.getByText("Gönderilmedi")).toBeInTheDocument();
    expect(screen.getByText("AI tedarikçi araması kapatıldı ya da talep yalnız davet edilen firmalara açıldı")).toBeInTheDocument();
    expect(screen.queryByText("Davet iptal edildi")).toBeNull();
    view.rerender(<InviteOutcome invite="NOT_SENT" reason="CANCELLED" />);
    expect(screen.getByText("Davet iptal edildi")).toBeInTheDocument();
  });

  it("neden yalnız gönderilmeyen davette yazılır; tanınmayan kod yalnız 'Gönderilmedi' der", () => {
    const view = render(<InviteOutcome invite="INVITED" reason={AUTO_INVITE_OFF_REASON} />);
    expect(screen.queryByText(/AI tedarikçi araması kapatıldı/)).toBeNull();
    view.rerender(<InviteOutcome invite="NOT_SENT" reason="YENI_BIR_KOD" />);
    expect(screen.getByText("Gönderilmedi").parentElement?.textContent).toBe("Gönderilmedi");
  });

  // Otomatik tur yalnız güçlü eşleşmeyi davet eder (canlı doğrulama AUTO-MEMBER-1).
  // Yalnız genel sektörü tutan üye "bulundu ama davet edilmedi"dir: hata tonu ve
  // "Gönderilmedi" etiketi yanlış izlenim verirdi.
  it("zayıf eşleşme: 'Davet edilmedi' der, nedenini yazar ve hata (amber) tonu taşımaz", () => {
    render(<InviteOutcome invite="NOT_SENT" reason={WEAK_MATCH_REASON} />);
    const chip = screen.getByText("Davet edilmedi");
    expect(screen.queryByText("Gönderilmedi")).toBeNull();
    expect(chip.className).not.toContain("amber");
    expect(chip.className).toContain("zinc");
    expect(screen.getByText(/Yalnız genel sektör eşleşti/)).toBeInTheDocument();
    expect(screen.getByText(/AI ile tedarikçi bul/)).toBeInTheDocument();
  });
});
