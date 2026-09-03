// @vitest-environment jsdom
/**
 * "Size uygun açık talepler" — satış panosu ÖZET sözleşmesi.
 *
 * Kilitlenen iddialar:
 *  · satış panosu ALIM taleplerini ister (yön ters dönerse kullanıcı kendi
 *    ilanlarını "fırsat" sanır) ve en fazla 3 tane;
 *  · panoda arama kutusu ve "İlan aç" YOK — bunlar Açık Talepler sayfası ve
 *    sol menünün işi; kopyası eski keşif kartındaydı;
 *  · boş durum TEK eylem ("Sektörleri düzenle") — "Bağlantı Kur" burada
 *    tekrarlanmaz.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis",
}));

import {
  MATCHED_REQUESTS_LIMIT,
  MatchedRequestsWidget,
  SECTOR_EDIT_HREF,
} from "../matched-requests-widget";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const ROW = {
  id: "l1",
  number: "ROT-000042",
  title: "Paslanmaz çelik boru",
  status: "OPEN",
  visibility: "PUBLIC",
  format: null,
  currency: "TRY",
  isInternational: false,
  closesAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  createdAt: new Date().toISOString(),
  itemCount: 3,
  owner: { id: "c1", name: "Alfa Metal" },
  ownerCity: "İzmir",
  coverImageUrl: null,
  masked: false,
  canBid: true,
  invited: true,
  connected: false,
  myBidStatus: null,
  myBidVersion: null,
  categoryMatch: true,
  categories: [{ code: "40171501", name: "Çelik boru" }],
  extraCategoryCount: 0,
  minPrice: null,
  buyNowPrice: null,
};

beforeEach(() => {
  h.get.mockReset();
});

describe("MatchedRequestsWidget", () => {
  it("ALIM taleplerini, en fazla 3 tane ve yalnız açık olanları ister", async () => {
    h.get.mockResolvedValue({ data: [ROW] });
    wrap(<MatchedRequestsWidget />);
    await screen.findByText("Paslanmaz çelik boru");
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(MATCHED_REQUESTS_LIMIT).toBe(3);
    expect(
      urls.some(
        (u) =>
          u.includes("seller-tenders?type=ALIM") &&
          u.includes("limit=3") &&
          u.includes("openOnly=true"),
      ),
    ).toBe(true);
    expect(urls.some((u) => u.includes("type=SATIS"))).toBe(false);
  });

  it("kompakt satır: alıcı, kapanış ve 'Teklif ver' bağlantısı — arama/CTA yok", async () => {
    h.get.mockResolvedValue({ data: [ROW] });
    wrap(<MatchedRequestsWidget />);
    await screen.findByText("Paslanmaz çelik boru");
    expect(screen.getByText("Alfa Metal")).toBeInTheDocument();
    const bid = screen.getByRole("link", { name: "Teklif ver" });
    expect(bid).toHaveAttribute("href", expect.stringContaining("/company/ilan/l1"));
    // Pano özet: arama kutusu ve ilan açma CTA'sı burada YOK.
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/İlan aç/)).toBeNull();
    expect(
      screen.getByRole("link", { name: /Tüm açık talepleri gör/ }),
    ).toHaveAttribute("href", "/company/satis/acik-talepler");
  });

  it("boş durum: tek cümle + TEK eylem (Sektörleri düzenle), 'Bağlantı Kur' yok", async () => {
    h.get.mockResolvedValue({ data: [] });
    wrap(<MatchedRequestsWidget />);
    expect(await screen.findByText("Eşleşen açık talep yok.")).toBeInTheDocument();
    const edit = screen.getByRole("link", { name: "Sektörleri düzenle" });
    expect(edit).toHaveAttribute("href", SECTOR_EDIT_HREF);
    expect(screen.queryByText(/Bağlantı Kur/)).toBeNull();
    // "Tüm açık talepleri gör" dışında ikinci bir eylem yok.
    const links = screen.getAllByRole("link").map((a) => a.textContent?.trim());
    expect(links).toEqual(["Sektörleri düzenle", "Tüm açık talepleri gör"]);
  });
});
