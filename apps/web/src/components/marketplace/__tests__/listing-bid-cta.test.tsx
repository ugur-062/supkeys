// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ListingBidCta, usePublicBidAction } from "../listing-bid-cta";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * Arayüz testi webA-02 yeniden doğrulama: herkese açık talep sayfasındaki
 * "Bu talebe teklif vermek için ücretsiz kaydol" oturumlu üyeye de basılıyor,
 * ücretsiz üye kayıt → panel → Silver kilidine SÜRPRİZ olarak düşüyordu.
 * PUBLIC talebe teklif Silver ister; kapı tıklamadan önce söylenir.
 */
function signIn(tier: string | null, status = "VERIFIED", permissions: string[] = ["sell:view", "sell:bid:submit"]) {
  useCompanyAuthStore.setState({
    isHydrated: true,
    user: tier ? ({ id: "u", permissions, roles: [] } as never) : null,
    company: tier ? ({ tier, companyVerificationStatus: status } as never) : null,
  });
}

const PANEL = "/company/satis?q=ROT-000478#acik-talepler";
/* eslint-disable @next/next/no-html-link-for-pages -- yer tutucu misafir CTA'sı */
const guest = <a href="/company/kayit?intent=teklif">Teklif vermek için kaydol</a>;
/* eslint-enable @next/next/no-html-link-for-pages */

beforeEach(() => signIn(null));

describe("ListingBidCta", () => {
  it("misafir: sunucunun bastığı kayıt CTA'sı", () => {
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByRole("link", { name: "Teklif vermek için kaydol" })).toBeInTheDocument();
  });

  it("ücretsiz, doğrulanmamış: kayıt CTA'sı yok, Silver açıklaması + önce doğrulama + davetliye panel", () => {
    signIn("STANDART", "UNVERIFIED");
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.queryByText("Teklif vermek için kaydol")).toBeNull();
    expect(screen.getByText("Herkese açık taleplere teklif Silver paketiyle verilir")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Önce ücretsiz doğrulan" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    expect(screen.getByRole("link", { name: "Bu talebe davetliyseniz panelde teklif verin" })).toHaveAttribute("href", PANEL);
  });

  it("ücretsiz, doğrulanmış: Silver'a geçiş", () => {
    signIn("STANDART", "VERIFIED");
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByRole("link", { name: "Silver paketine geç" })).toHaveAttribute("href", "/company/premium");
  });

  it("Silver ∧ teklif izni: doğrudan panelde teklif", () => {
    signIn("SILVER");
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByRole("link", { name: "Panelde teklif ver" })).toHaveAttribute("href", PANEL);
    expect(screen.queryByText("Teklif vermek için kaydol")).toBeNull();
  });

  it("Silver ama teklif izni yok (Satın Almacı): yetki notu", () => {
    signIn("SILVER", "VERIFIED", ["buy:view"]);
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByText("Teklif vermek için teklif verme yetkisi gerekir.")).toBeInTheDocument();
  });

  it("compact (gövdedeki kilit kutusu): ücretsiz üyeye tek satır, tam açıklama yok", () => {
    signIn("STANDART", "VERIFIED");
    render(<ListingBidCta number="ROT-000478" compact>{guest}</ListingBidCta>);
    expect(screen.getByText("Ayrıntılar ve teklif Silver paketiyle açılır.")).toBeInTheDocument();
    expect(screen.queryByText("Herkese açık taleplere teklif Silver paketiyle verilir")).toBeNull();
  });
});

function Action() {
  const a = usePublicBidAction("ROT-000478", "Teklif ver", "/company/kayit?intent=teklif");
  return a ? <a href={a.href}>{a.label}</a> : null;
}

describe("usePublicBidAction (anasayfa satırı \"Teklif ver\")", () => {
  it("misafir → kayıt; ücretsiz → \"Teklif ver · Silver\" doğrulamaya; Silver → panel", () => {
    const { unmount } = render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver" })).toHaveAttribute("href", "/company/kayit?intent=teklif");
    unmount();

    signIn("STANDART", "UNVERIFIED");
    const second = render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver · Silver" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
    second.unmount();

    signIn("SILVER");
    render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver" })).toHaveAttribute("href", PANEL);
  });

  // Arayüz testi son tur (webA-1): Silver ama `sell:bid:submit` yok →
  // talep sayfası yetki notu verirken anasayfa satırı "Teklif ver" basıyordu.
  it("Silver ∧ teklif yetkisi yok: eylem çizilmez (paket önce, sonra izin)", () => {
    signIn("SILVER", "VERIFIED", ["sell:view"]);
    const { container } = render(<Action />);
    expect(container).toBeEmptyDOMElement();
  });

  it("paket izinden önce: ücretsiz ∧ yetkisiz üyeye yine Silver kilidi", () => {
    signIn("STANDART", "VERIFIED", ["sell:view"]);
    render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver · Silver" })).toHaveAttribute("href", "/company/premium");
  });
});
