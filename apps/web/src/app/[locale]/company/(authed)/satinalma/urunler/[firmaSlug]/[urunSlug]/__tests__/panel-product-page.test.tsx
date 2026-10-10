// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  perms: [] as string[],
  website: null as string | null,
  ownSlug: null as string | null,
  category: null as { id: string; name: string } | null,
  trail: [] as { label: string; href: string }[],
  rfq: 0,
  /** İlişkili ürünler geldi mi (`RelatedRows` yalnız veriyle çizilir). */
  related: false,
  /** Ürün sorgusunun yerine geçer (yanıt yok / hata / 404 = `data: null`). */
  query: undefined as
    | { data: unknown; isLoading: boolean; isPending: boolean; isError: boolean; refetch?: () => void }
    | undefined,
  /** `RelatedRows`e geçen son kategori adı ("… içinde yeni" başlığı). */
  relatedCategoryName: undefined as string | null | undefined,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ firmaSlug: "abc", urunSlug: "urun-x" }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
  useCompanyAuth: () => ({ user: { id: "u" }, company: { slug: h.ownSlug } }),
}));
vi.mock("@/hooks/use-portal-discovery", () => ({
  usePublicProduct: () => h.query ?? ({
    isLoading: false,
    isPending: false,
    isError: false,
    data: {
      product: { name: "Urun X", category: h.category, unit: "adet", categoryId: null, keywords: [] },
      company: { name: "ABC", slug: "abc", website: h.website, freeMember: false },
    },
  }),
  useRelatedProducts: () => ({
    data: h.related ? { fromCompany: { items: [], total: 0 }, similar: [], popular: [] } : undefined,
  }),
}));
vi.mock("@/components/marketplace/product-detail", () => ({
  ProductBreadcrumb: ({ trail }: { trail: { label: string; href: string }[] }) => {
    h.trail = trail;
    return null;
  },
  RelatedRows: ({ categoryName }: { categoryName: string | null }) => {
    h.relatedCategoryName = categoryName;
    return null;
  },
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
  h.related = false;
  h.relatedCategoryName = undefined;
  h.query = undefined;
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

  // 2026-10-09 (sahip kararı; arayüz denetimi W-05): D-023 yalnız kırıntıyı
  // kapatmıştı; gizli kategori adı "… içinde yeni" başlığına hâlâ gidiyordu.
  it("gizli segmentteki kategori 'kategoride yeni' başlığına da gitmez; görünür kategori gider", () => {
    h.related = true;
    h.category = { id: "46101500", name: "Ateşli silahlar" };
    const { unmount } = render(<PanelProductPage />);
    expect(h.relatedCategoryName).toBeNull();
    expect(h.trail.map((s) => s.label)).not.toContain("Ateşli silahlar");
    unmount();
    h.category = { id: "39121000", name: "Panolar" };
    render(<PanelProductPage />);
    expect(h.relatedCategoryName).toBe("Panolar");
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

describe("Panel ürün sayfası — kesinti ≠ bulunamadı (canlı doğrulama 2026-10-09 taraması)", () => {
  // Kanca 404'ü `data: null` (başarılı "yok") olarak döndürür; `isError` = ürün
  // OKUNAMADI. Eskiden ikisi de "Ürün bulunamadı — vitrinden çekilmiş" diyordu.
  it("ürün okunamadıysa 'Ürün bulunamadı' değil hata + Tekrar dene", () => {
    const refetch = vi.fn();
    h.query = { data: undefined, isLoading: false, isPending: false, isError: true, refetch };
    render(<PanelProductPage />);
    expect(screen.queryByText("Ürün bulunamadı.")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) 'Yükleniyor…'", () => {
    h.query = { data: undefined, isLoading: false, isPending: true, isError: false };
    render(<PanelProductPage />);
    expect(screen.queryByText("Ürün bulunamadı.")).toBeNull();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("API'nin 404 yanıtı (kanca `null` döner) gerçek 'Ürün bulunamadı'dır", () => {
    h.query = { data: null, isLoading: false, isPending: false, isError: false };
    render(<PanelProductPage />);
    expect(screen.getByText("Ürün bulunamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
