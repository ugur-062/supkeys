// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Arayüz testi O-077 / D-130 / D-157 / D-174: ürün incelemesinde ekler
 * tıklanabilir (yalnız http(s)), etiketler ham enum değil, fiyat biçimli,
 * göreli görsel vitrin kökeninde, kademe efektif.
 */
const h = vi.hoisted(() => ({ product: undefined as unknown }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "p1" }) }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ admin: { role: "SUPPORT" } }) }));
vi.mock("@/lib/api", () => ({ toastApiError: vi.fn() }));
vi.mock("@/hooks/use-admin-products", () => ({
  useAdminProductDetail: () => ({ data: h.product, isLoading: false, isError: false, refetch: vi.fn() }),
  useProductReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import AdminUrunDetayPage from "../page";

function product(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Dirsek",
    slug: "dirsek",
    cover: "/categories/elektrik.webp",
    imageCount: 2,
    images: ["/categories/elektrik.webp", "https://cdn.example.com/a.jpg"],
    categoryId: "39000000",
    categoryName: "Elektrik",
    reviewStatus: "PENDING",
    isPublic: false,
    submittedAt: "2026-09-30T10:00:00.000Z",
    reviewedAt: null,
    reviewedByAdminId: null,
    rejectReason: null,
    updatedAt: "2026-09-30T10:00:00.000Z",
    createdAt: "2026-09-29T10:00:00.000Z",
    code: null,
    description: "Açıklama",
    keywords: [],
    brand: null,
    mpn: null,
    priceMode: "TIERED",
    priceAmount: null,
    priceTiers: [{ minQty: 1000, unitPrice: 11.5 }],
    priceCurrency: "TRY",
    moq: "1000",
    unit: "adet",
    videoUrl: "https://youtube.com/watch?v=abc",
    externalUrl: "javascript:alert(1)",
    documents: [
      { url: "https://cdn.example.com/katalog.pdf", title: "Katalog" },
      { url: "/uploads/sertifika.pdf", title: "Sertifika" },
    ],
    completionScore: 80,
    attributeList: [],
    publicUrl: "/firma/acme/urun/dirsek",
    company: {
      id: "c1",
      name: "Acme",
      slug: "acme",
      city: "İzmir",
      tier: "SILVER",
      effectiveTier: "STANDART",
      membershipEndAt: "2026-10-01T09:00:00.000Z",
      verification: "VERIFIED",
      isBlocked: false,
      publicUrl: null,
    },
    ...over,
  };
}

beforeEach(() => {
  h.product = product();
});

describe("/admin/urunler/[id] — ürün incelemesi", () => {
  it("başlıkta efektif kademe ve doğrulama etiketi (ham SILVER/VERIFIED yok)", () => {
    render(<AdminUrunDetayPage />);
    expect(screen.getByText(/Standart \(Silver süresi doldu 1 Eki 2026\) · Doğrulandı/)).toBeInTheDocument();
    expect(screen.queryByText(/VERIFIED/)).not.toBeInTheDocument();
  });

  it("kademe fiyatı ve miktar biçimli", () => {
    render(<AdminUrunDetayPage />);
    const tiers = screen.getByText(/1\.000\+ adet →/);
    expect(tiers.textContent).toMatch(/11,50/);
    expect(tiers.textContent).not.toMatch(/11\.5 TRY/);
  });

  it("video ve belgeler bağlantı; javascript: adresi bağlantı olmaz; göreli yollar vitrin kökeninde", () => {
    const { container } = render(<AdminUrunDetayPage />);
    expect(screen.getByRole("link", { name: /youtube\.com/ })).toHaveAttribute("href", "https://youtube.com/watch?v=abc");
    expect(screen.getByRole("link", { name: /youtube\.com/ })).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: /javascript:/ })).not.toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Katalog/ })).toHaveAttribute("href", "https://cdn.example.com/katalog.pdf");
    expect(screen.getByRole("link", { name: /Sertifika/ }).getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/uploads\/sertifika\.pdf$/);
    const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs[0]).toMatch(/^https?:\/\/[^/]+\/categories\/elektrik\.webp$/);
    expect(srcs[1]).toBe("https://cdn.example.com/a.jpg");
  });
});
