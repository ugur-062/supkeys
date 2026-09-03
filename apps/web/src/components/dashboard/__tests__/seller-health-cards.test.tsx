// @vitest-environment jsdom
/**
 * Profil & katalog sağlığı — pano kartları.
 *
 * Kilit: yüzde Profilim ile AYNI fonksiyondan gelir (burada yeniden hesap
 * yok), ürün sayaçları sunucunun firma-geneli `counts`undan okunur.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profileCompleteness } from "@/lib/company/profile-completeness";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get },
}));

import { SellerHealthCards } from "../seller-health-cards";

const PROFILE = {
  id: "c1",
  name: "Alfa Metal",
  logoUrl: "https://cdn/logo.png",
  coverImageUrl: null,
  aboutText: null,
  services: [],
  photos: [],
  foundedYear: null,
  employeeCount: null,
  website: null,
  industry: null,
  city: "İzmir",
  buyerCategoryIds: [],
  sellerCategoryIds: [],
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.get.mockReset();
  h.get.mockImplementation((url: string) =>
    url.includes("/company/items")
      ? Promise.resolve({
          data: { items: [], total: 0, truncated: false, counts: { published: 1, draft: 2 } },
        })
      : Promise.resolve({ data: PROFILE }),
  );
});

describe("SellerHealthCards", () => {
  it("profil yüzdesi Profilim'in hesabıyla AYNI, ilk 3 eksik + kalan sayısı", async () => {
    wrap(<SellerHealthCards />);
    const expected = profileCompleteness(PROFILE);
    expect(await screen.findByText(`Profil %${expected.pct} tamam`)).toBeInTheDocument();
    expect(
      screen.getByText(`Eksik: ${expected.missing.slice(0, 3).join(", ")} +${expected.missing.length - 3}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Profili tamamla/ })).toHaveAttribute(
      "href",
      "/company/satis/profilim",
    );
  });

  it("ürün sayaçları sunucunun counts alanından; take=1 ile sorulur", async () => {
    wrap(<SellerHealthCards />);
    expect(await screen.findByText("1 yayında · 2 taslak")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ürün ekle/ })).toHaveAttribute(
      "href",
      "/company/satis/urunlerim",
    );
    const call = h.get.mock.calls.find((c) => String(c[0]).includes("/company/items"));
    expect(call?.[1]).toEqual({ params: { take: 1 } });
  });
});
