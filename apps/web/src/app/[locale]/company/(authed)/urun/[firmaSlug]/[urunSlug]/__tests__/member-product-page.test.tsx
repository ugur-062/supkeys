// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as null | { id: string; permissions: string[]; roles: string[] },
  company: null as null | { tier: string; companyVerificationStatus: string; slug: string },
  replace: vi.fn(),
  fetchedFor: "" as string,
  /** Ürün sorgusunun yerine geçer (yanıt yok / hata / 404 = `data: null`). */
  query: undefined as
    | { data: unknown; isLoading: boolean; isPending: boolean; isError: boolean; refetch?: () => void }
    | undefined,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ firmaSlug: "abc", urunSlug: "urun-x" }),
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  usePathname: () => "/company/urun/abc/urun-x",
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: h.user, company: h.company }),
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  usePublicProduct: (companySlug: string) => {
    h.fetchedFor = companySlug;
    if (companySlug && h.query) return h.query;
    return companySlug
      ? {
          isLoading: false,
          isPending: false,
          isError: false,
          data: {
            product: { name: "Urun X", category: null, unit: "adet", categoryId: null, keywords: [] },
            company: { name: "ABC", slug: "abc" },
          },
        }
      : { isLoading: false, isPending: true, isError: false, data: undefined };
  },
}));
vi.mock("@/components/marketplace/product-detail", () => ({
  ProductBreadcrumb: () => null,
  ProductDetailBody: ({ cta }: { cta: ReactNode }) => <div data-testid="body">{cta}</div>,
}));

import { useCompanyAuthStore } from "@/lib/company-auth/store";
import MemberProductPage from "../page";

const VERIFY = "/company/ayarlar/dogrulama";

/** Uyarı kutusunun aşaması (doğrula / incelemede / yeniden başvur) `/me` deposundan okunur. */
function setStoreCompany(company: typeof h.company) {
  useCompanyAuthStore.setState({ company, isHydrated: true } as never);
}

const perms = (...p: string[]) => ({ id: "u", permissions: p, roles: [] });

beforeEach(() => {
  h.user = null;
  h.company = null;
  h.replace.mockClear();
  h.fetchedFor = "";
  h.query = undefined;
  setStoreCompany(null);
});

/**
 * Arayüz testi Y-03 (kullanıcı kararı T-02): herkese açık sayfanın giriş/kayıt
 * dönüşü ve panel kartları bu adrese gelir — tam yetkisi olmayan (doğrulanmamış)
 * üye yetki DUVARINA değil ürüne + doğrulama uyarısına düşer. Ücretsiz dönem
 * (2026-10-07): uyarı paket adı söylemez, tek eylem doğrulama akışıdır.
 */
describe("Üyenin ürün sayfası", () => {
  it("tam yetkili (doğrulanmış) ∧ satınalma görüntüleme → satınalma ürün sayfasına geçer", () => {
    h.user = perms("buy:view", "buy:inquiry:send");
    h.company = { tier: "GOLD", companyVerificationStatus: "VERIFIED", slug: "me" };
    render(<MemberProductPage />);
    expect(h.replace).toHaveBeenCalledWith("/company/satinalma/urunler/abc/urun-x");
  });

  it("doğrulanmamış Kurucu: ürün panelde + ücretsiz doğrulama uyarısı, yönlendirme YOK", () => {
    h.user = perms("buy:view", "sell:view");
    h.company = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED", slug: "me" };
    setStoreCompany(h.company);
    render(<MemberProductPage />);
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("body")).toBeInTheDocument();
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Bilgi talebi göndermek için firma doğrulaması gerekir");
    expect(note).toHaveTextContent("Doğrulama ücretsizdir; onaylandığında tüm özellikler açılır.");
    expect(screen.getByRole("link", { name: "Firmanızı ücretsiz doğrulayın" })).toHaveAttribute("href", VERIFY);
    // Paket adı ve paket sayfası yok.
    expect(note).not.toHaveTextContent(/Silver|Gold|Platinum|paket/i);
    expect(document.querySelector('a[href*="/company/premium"]')).toBeNull();
  });

  it("doğrulaması incelemede: yeniden başvuru istenmez, durum bağlantısı", () => {
    h.user = perms("buy:view");
    h.company = { tier: "STANDART", companyVerificationStatus: "PENDING", slug: "me" };
    setStoreCompany(h.company);
    render(<MemberProductPage />);
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("note")).toHaveTextContent(/Doğrulamanız inceleniyor/);
    expect(screen.getByRole("link", { name: "Doğrulama durumunu görün" })).toHaveAttribute("href", VERIFY);
    expect(screen.queryByRole("link", { name: "Firmanızı ücretsiz doğrulayın" })).toBeNull();
    expect(document.querySelector('a[href*="/company/premium"]')).toBeNull();
  });

  it("doğrulaması reddedilmiş: yeniden başvuru", () => {
    h.user = perms("buy:view");
    h.company = { tier: "STANDART", companyVerificationStatus: "REJECTED", slug: "me" };
    setStoreCompany(h.company);
    render(<MemberProductPage />);
    expect(screen.getByRole("note")).toHaveTextContent(/başvurunuz onaylanmadı/);
    expect(screen.getByRole("link", { name: "Yeniden başvurun" })).toHaveAttribute("href", VERIFY);
  });

  it("tam yetkili firma ama bilgi talebi izni yok: doğrulama uyarısı değil yetki notu (önce yetki, sonra izin)", () => {
    h.user = perms("sell:view");
    h.company = { tier: "GOLD", companyVerificationStatus: "VERIFIED", slug: "me" };
    setStoreCompany(h.company);
    render(<MemberProductPage />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.querySelector(`a[href="${VERIFY}"]`)).toBeNull();
  });

  it("satınalma görüntüleme yetkisi yok: panel ucu çağrılmaz, yetki notu + herkese açık sayfa", () => {
    h.user = perms("sell:view");
    h.company = { tier: "SILVER", companyVerificationStatus: "VERIFIED", slug: "me" };
    render(<MemberProductPage />);
    expect(h.fetchedFor).toBe("");
    expect(screen.getByRole("link", { name: "Ürünün herkese açık sayfası" })).toHaveAttribute(
      "href",
      "/firma/abc/urun/urun-x",
    );
  });

  // webA-03 yeniden doğrulama: herkese açık "Belgeyi indirmek için giriş
  // yapın" dönüşü `#belgeler` ile gelir; izinsiz üye döngüye girmez, belgeyi
  // oturumla veren herkese açık sayfanın Belgeler sekmesine geçer.
  it("satınalma görüntüleme yok + #belgeler: herkese açık sayfanın Belgeler sekmesine geçer", () => {
    window.history.replaceState(null, "", "#belgeler");
    try {
      h.user = perms("sell:view", "sell:bid:submit");
      h.company = { tier: "SILVER", companyVerificationStatus: "VERIFIED", slug: "me" };
      render(<MemberProductPage />);
      expect(h.replace).toHaveBeenCalledWith("/firma/abc/urun/urun-x#belgeler");
    } finally {
      window.history.replaceState(null, "", window.location.pathname);
    }
  });

  it("satınalma görüntüleme yok, çapa yok: yönlendirme yok", () => {
    h.user = perms("sell:view");
    h.company = { tier: "SILVER", companyVerificationStatus: "VERIFIED", slug: "me" };
    render(<MemberProductPage />);
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("kendi ürünü: uyarı yerine 'sizin firmanıza ait' notu", () => {
    h.user = perms("buy:view");
    h.company = { tier: "SILVER", companyVerificationStatus: "VERIFIED", slug: "abc" };
    render(<MemberProductPage />);
    expect(screen.getByText(/Bu ürün sizin firmanıza ait/)).toBeInTheDocument();
  });
});

describe("Üyenin ürün sayfası — kesinti ≠ bulunamadı (canlı doğrulama 2026-10-09 taraması)", () => {
  const NOT_FOUND = "Ürün bulunamadı";
  const unverified = () => {
    h.user = perms("buy:view", "sell:view");
    h.company = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED", slug: "me" };
    setStoreCompany(h.company);
  };

  it("ürün okunamadıysa 'bulunamadı' değil hata + Tekrar dene", () => {
    unverified();
    const refetch = vi.fn();
    h.query = { data: undefined, isLoading: false, isPending: false, isError: true, refetch };
    render(<MemberProductPage />);
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    screen.getByRole("button", { name: "Tekrar dene" }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) 'bulunamadı' çizilmez", () => {
    unverified();
    h.query = { data: undefined, isLoading: false, isPending: true, isError: false };
    render(<MemberProductPage />);
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("API'nin 404 yanıtı (kanca `null` döner) gerçek 'bulunamadı'dır", () => {
    unverified();
    h.query = { data: null, isLoading: false, isPending: false, isError: false };
    render(<MemberProductPage />);
    expect(screen.getByText(NOT_FOUND)).toBeInTheDocument();
  });
});
