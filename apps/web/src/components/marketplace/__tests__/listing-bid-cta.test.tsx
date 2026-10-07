// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ListingBidCta, usePublicBidAction } from "../listing-bid-cta";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * Arayüz testi webA-02 yeniden doğrulama: herkese açık talep sayfasındaki
 * "Bu talebe teklif vermek için ücretsiz kaydol" oturumlu üyeye de basılıyor,
 * doğrulanmamış üye kayıt → panel → kilide SÜRPRİZ olarak düşüyordu.
 * PUBLIC talebe teklif firma doğrulaması ister; kapı tıklamadan önce söylenir.
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): doğrulanmış firmanın `/me` kademesi efektif
 * olarak en üst kademedir ("GOLD" — iç tanımlayıcı, arayüzde yazılmaz);
 * doğrulanmamış firma "STANDART" kalır. Metinlerde paket adı geçmez.
 */
const VERIFY = "/company/ayarlar/dogrulama";
const PACKAGE_WORDS = /Gold|Silver|paket|premium/i;
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

  it("doğrulanmamış: kayıt CTA'sı yok, doğrulama açıklaması + ücretsiz doğrulama + davetliye panel", () => {
    signIn("STANDART", "UNVERIFIED");
    const { container } = render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.queryByText("Teklif vermek için kaydol")).toBeNull();
    expect(screen.getByText("Herkese açık taleplere teklif vermek için firma doğrulaması gerekir")).toBeInTheDocument();
    expect(screen.getByText(/Doğrulama ücretsizdir/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Firmanızı ücretsiz doğrulayın" })).toHaveAttribute("href", VERIFY);
    expect(screen.getByRole("link", { name: "Bu talebe davetliyseniz panelde teklif verin" })).toHaveAttribute("href", PANEL);
    expect(container.textContent).not.toMatch(PACKAGE_WORDS);
  });

  it("doğrulama incelemede: durum bağlantısı (yeniden başvuru istenmez); reddedilmiş: yeniden başvuru", () => {
    signIn("STANDART", "PENDING");
    const first = render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByText(/Doğrulamanız inceleniyor/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Doğrulama durumunu görün" })).toHaveAttribute("href", VERIFY);
    first.unmount();

    signIn("STANDART", "REJECTED");
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByText(/Doğrulama başvurunuz onaylanmadı/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yeniden başvurun" })).toHaveAttribute("href", VERIFY);
  });

  it("doğrulanmış ∧ teklif izni: doğrudan panelde teklif", () => {
    signIn("GOLD");
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByRole("link", { name: "Panelde teklif ver" })).toHaveAttribute("href", PANEL);
    expect(screen.queryByText("Teklif vermek için kaydol")).toBeNull();
  });

  it("doğrulanmış ama teklif izni yok (Satın Almacı): yetki notu", () => {
    signIn("GOLD", "VERIFIED", ["buy:view"]);
    render(<ListingBidCta number="ROT-000478">{guest}</ListingBidCta>);
    expect(screen.getByText("Teklif vermek için teklif verme yetkisi gerekir.")).toBeInTheDocument();
  });

  it("compact (gövdedeki kilit kutusu): doğrulanmamış üyeye tek satır, tam açıklama yok", () => {
    signIn("STANDART", "UNVERIFIED");
    render(<ListingBidCta number="ROT-000478" compact>{guest}</ListingBidCta>);
    expect(screen.getByText("Ayrıntılar ve teklif firma doğrulamasıyla açılır.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Firmanızı ücretsiz doğrulayın" })).toHaveAttribute("href", VERIFY);
    expect(screen.queryByText("Herkese açık taleplere teklif vermek için firma doğrulaması gerekir")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

function Action() {
  const a = usePublicBidAction("ROT-000478", "Teklif ver", "/company/kayit?intent=teklif");
  return a ? <a href={a.href}>{a.label}</a> : null;
}

describe("usePublicBidAction (anasayfa satırı \"Teklif ver\")", () => {
  it("misafir → yalın \"Teklif ver\" kayda; doğrulanmamış → \"Teklif ver · Doğrulama gerekli\" doğrulamaya; incelemede → \"· Doğrulama inceleniyor\"; doğrulanmış → panel", () => {
    // Misafir etiketi yalın: davetli tedarikçi doğrulama olmadan da teklif verir.
    const { unmount } = render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver" })).toHaveAttribute("href", "/company/kayit?intent=teklif");
    unmount();

    signIn("STANDART", "UNVERIFIED");
    const second = render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver · Doğrulama gerekli" })).toHaveAttribute("href", VERIFY);
    second.unmount();

    signIn("STANDART", "PENDING");
    const third = render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver · Doğrulama inceleniyor" })).toHaveAttribute("href", VERIFY);
    third.unmount();

    signIn("GOLD");
    render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver" })).toHaveAttribute("href", PANEL);
  });

  // Arayüz testi son tur (webA-1): tam yetkili ama `sell:bid:submit` yok →
  // talep sayfası yetki notu verirken anasayfa satırı "Teklif ver" basıyordu.
  it("doğrulanmış ∧ teklif yetkisi yok: eylem çizilmez (önce firmanın yetkisi, sonra izin)", () => {
    signIn("GOLD", "VERIFIED", ["sell:view"]);
    const { container } = render(<Action />);
    expect(container).toBeEmptyDOMElement();
  });

  it("doğrulama izinden önce: doğrulanmamış ∧ izinsiz üyeye yine doğrulama kilidi", () => {
    signIn("STANDART", "UNVERIFIED", ["sell:view"]);
    render(<Action />);
    expect(screen.getByRole("link", { name: "Teklif ver · Doğrulama gerekli" })).toHaveAttribute("href", VERIFY);
  });
});
