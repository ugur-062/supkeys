// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  perms: [] as string[],
  website: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ firmaSlug: "abc", urunSlug: "urun-x" }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  usePublicProduct: () => ({
    isLoading: false,
    isError: false,
    data: {
      product: { name: "Urun X", category: null, unit: "adet", categoryId: null, keywords: [] },
      company: { name: "ABC", website: h.website, freeMember: false },
    },
  }),
  useRelatedProducts: () => ({ data: undefined }),
}));
vi.mock("@/components/marketplace/product-detail", () => ({
  ProductBreadcrumb: () => null,
  RelatedRows: () => null,
  ProductDetailBody: ({ sellerSite, cta }: { sellerSite: ReactNode; cta: ReactNode }) => (
    <div>
      {sellerSite}
      {cta}
    </div>
  ),
}));
vi.mock("@/components/inquiries/panel-inquiry-dialog", () => ({
  PanelInquiryDialog: () => null,
}));
vi.mock("@/components/marketplace/rfq-banner", () => ({ RfqBanner: () => null }));

import PanelProductPage from "../page";

beforeEach(() => {
  h.perms = [];
  h.website = null;
});

describe("Panel ürün sayfası (derin denetim LU-22)", () => {
  it("buy:inquiry:send yoksa 'Bilgi iste' düğmesi yerine yetki notu", () => {
    h.perms = ["buy:view"];
    render(<PanelProductPage />);
    expect(screen.queryByRole("button", { name: "Bilgi iste" })).toBeNull();
    expect(screen.getByText("Bilgi istemek için Satın Almacı yetkisi gerekir.")).toBeInTheDocument();
  });

  it("buy:inquiry:send varsa düğme görünür", () => {
    h.perms = ["buy:view", "buy:inquiry:send"];
    render(<PanelProductPage />);
    expect(screen.getByRole("button", { name: "Bilgi iste" })).toBeInTheDocument();
  });

  it("şemasız web sitesi mutlak adrese çevrilir (göreli bağlantı olmaz)", () => {
    h.website = "www.abc.com";
    render(<PanelProductPage />);
    expect(screen.getByRole("link", { name: /Firmanın web sitesi/ })).toHaveAttribute(
      "href",
      "https://www.abc.com/",
    );
  });

  it("güvensiz şemalı web sitesi bağlantı olarak basılmaz", () => {
    h.website = "javascript:alert(1)";
    render(<PanelProductPage />);
    expect(screen.queryByRole("link", { name: /Firmanın web sitesi/ })).toBeNull();
  });
});
