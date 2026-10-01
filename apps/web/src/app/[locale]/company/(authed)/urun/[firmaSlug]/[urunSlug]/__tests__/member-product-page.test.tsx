// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as null | { id: string; permissions: string[]; roles: string[] },
  company: null as null | { tier: string; companyVerificationStatus: string; slug: string },
  replace: vi.fn(),
  fetchedFor: "" as string,
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
    return companySlug
      ? {
          isLoading: false,
          isError: false,
          data: {
            product: { name: "Urun X", category: null, unit: "adet", categoryId: null, keywords: [] },
            company: { name: "ABC", slug: "abc" },
          },
        }
      : { isLoading: false, isError: false, data: undefined };
  },
}));
vi.mock("@/components/marketplace/product-detail", () => ({
  ProductBreadcrumb: () => null,
  ProductDetailBody: ({ cta }: { cta: ReactNode }) => <div data-testid="body">{cta}</div>,
}));

import MemberProductPage from "../page";

const perms = (...p: string[]) => ({ id: "u", permissions: p, roles: [] });

beforeEach(() => {
  h.user = null;
  h.company = null;
  h.replace.mockClear();
  h.fetchedFor = "";
});

/**
 * Arayüz testi Y-03 (kullanıcı kararı T-02): herkese açık sayfanın giriş/kayıt
 * dönüşü ve panel kartları bu adrese gelir — Gold olmayan üye Gold DUVARINA
 * değil ürüne + Gold uyarısına düşer.
 */
describe("Üyenin ürün sayfası", () => {
  it("Gold ∧ satınalma görüntüleme → satınalma ürün sayfasına geçer", () => {
    h.user = perms("buy:view", "buy:inquiry:send");
    h.company = { tier: "GOLD", companyVerificationStatus: "VERIFIED", slug: "me" };
    render(<MemberProductPage />);
    expect(h.replace).toHaveBeenCalledWith("/company/satinalma/urunler/abc/urun-x");
  });

  it("ücretsiz Kurucu (doğrulanmamış): ürün panelde + önce ücretsiz doğrulama uyarısı, yönlendirme YOK", () => {
    h.user = perms("buy:view", "sell:view");
    h.company = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED", slug: "me" };
    render(<MemberProductPage />);
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("body")).toBeInTheDocument();
    expect(screen.getByText("Bilgi talebi Gold paketiyle gönderilir")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Önce ücretsiz doğrulan" })).toBeInTheDocument();
  });

  it("Silver (doğrulanmış): Gold'a geç", () => {
    h.user = perms("buy:view");
    h.company = { tier: "SILVER", companyVerificationStatus: "VERIFIED", slug: "me" };
    render(<MemberProductPage />);
    expect(screen.getByRole("link", { name: "Gold paketine geç" })).toHaveAttribute("href", "/company/premium");
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

  it("kendi ürünü: uyarı yerine 'sizin firmanıza ait' notu", () => {
    h.user = perms("buy:view");
    h.company = { tier: "SILVER", companyVerificationStatus: "VERIFIED", slug: "abc" };
    render(<MemberProductPage />);
    expect(screen.getByText(/Bu ürün sizin firmanıza ait/)).toBeInTheDocument();
  });
});
