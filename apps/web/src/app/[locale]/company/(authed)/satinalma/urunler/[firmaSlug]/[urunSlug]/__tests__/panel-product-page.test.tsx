// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  perms: [] as string[],
  website: null as string | null,
  ownSlug: null as string | null,
  category: null as { id: string; name: string } | null,
  trail: [] as { label: string; href: string }[],
  rfq: 0,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ firmaSlug: "abc", urunSlug: "urun-x" }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
  useCompanyAuth: () => ({ user: { id: "u" }, company: { slug: h.ownSlug } }),
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  usePublicProduct: () => ({
    isLoading: false,
    isError: false,
    data: {
      product: { name: "Urun X", category: h.category, unit: "adet", categoryId: null, keywords: [] },
      company: { name: "ABC", slug: "abc", website: h.website, freeMember: false },
    },
  }),
  useRelatedProducts: () => ({ data: undefined }),
}));
vi.mock("@/components/marketplace/product-detail", () => ({
  ProductBreadcrumb: ({ trail }: { trail: { label: string; href: string }[] }) => {
    h.trail = trail;
    return null;
  },
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
vi.mock("@/components/marketplace/rfq-banner", () => ({
  RfqBanner: () => {
    h.rfq += 1;
    return null;
  },
}));

import PanelProductPage from "../page";

beforeEach(() => {
  h.perms = [];
  h.website = null;
  h.ownSlug = null;
  h.category = null;
  h.trail = [];
  h.rfq = 0;
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

  it("KENDİ firmanın ürününde 'Bilgi iste' yok, not var (arayüz testi D-230)", () => {
    h.perms = ["buy:view", "buy:inquiry:send"];
    h.ownSlug = "abc";
    render(<PanelProductPage />);
    expect(screen.queryByRole("button", { name: "Bilgi iste" })).toBeNull();
    expect(screen.getByText(/Bu ürün sizin firmanıza ait/)).toBeInTheDocument();
  });

  it("gizli segmentteki kategori kırıntıya bağlantı olarak girmez (D-023); görünür kategori girer", () => {
    h.category = { id: "42181500", name: "Tanısal değerlendirme" };
    const { unmount } = render(<PanelProductPage />);
    expect(h.trail.map((s) => s.label)).not.toContain("Tanısal değerlendirme");
    unmount();
    h.category = { id: "39121000", name: "Panolar" };
    render(<PanelProductPage />);
    expect(h.trail.map((s) => s.label)).toContain("Panolar");
  });

  it("talep açma bandı yalnız buy:listing:manage ile (O-079)", () => {
    h.perms = ["buy:view"];
    const { unmount } = render(<PanelProductPage />);
    expect(h.rfq).toBe(0);
    unmount();
    h.perms = ["buy:view", "buy:listing:manage"];
    render(<PanelProductPage />);
    expect(h.rfq).toBeGreaterThan(0);
  });
});
