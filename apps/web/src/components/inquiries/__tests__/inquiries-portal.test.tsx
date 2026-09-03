// @vitest-environment jsdom
/**
 * BİLGİ TALEPLERİ — portal yönü sözleşmesi.
 *
 * Kilitlenen iddia: alıcı olarak GÖNDERDİĞİN talepler satın alma panelinde,
 * ürünlerine GELEN sorular satış panelinde. Eskiden ikisi tek ekranda ve o
 * ekran yalnız SATIŞ portalındaydı — satın alma panelinde bilgi talebi diye
 * bir şey yoktu, gönderdiklerin satış panelinin altında yaşıyordu.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: h.post },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma",
}));

import { InquiriesView } from "../inquiries-view";
import { PanelInquiryDialog } from "../panel-inquiry-dialog";
import { PRODUCT_SEED_KEY } from "@/lib/tenders/map-product-to-form";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const SENT = [
  {
    id: "i1",
    message: "Fiyat bilgisi rica ederim.",
    quantity: "500 adet",
    sentAt: new Date().toISOString(),
    seller: { name: "İkinci Firma", slug: "ikinci-firma" },
    product: { name: "Dağıtım Panosu", slug: "pano" },
    replies: [],
  },
];

const RECEIVED = {
  total: 1,
  items: [
    {
      id: "r1",
      name: "Ayşe Demir",
      companyName: "Alfa Metal",
      message: "Stok var mı?",
      quantity: null,
      receivedAt: new Date().toISOString(),
      hasAccount: true,
      product: { name: "Dağıtım Panosu", slug: "pano" },
      replies: [],
    },
  ],
};

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.push.mockReset();
  h.get.mockImplementation((url: string) =>
    url.includes("received")
      ? Promise.resolve({ data: RECEIVED })
      : Promise.resolve({ data: SENT }),
  );
});

describe("InquiriesView — portal yönü", () => {
  it("SATIŞ yalnız GELEN'i gösterir ve yalnız o ucu çağırır", async () => {
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText("Stok var mı?")).toBeInTheDocument();
    expect(screen.queryByText("Gönderdiklerim")).toBeNull();
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/received"))).toBe(true);
    // Karşı yönün sorgusu HİÇ açılmaz — rolü olmayan portalda gereksiz istek.
    expect(urls.some((u) => u.includes("/sent"))).toBe(false);
  });

  it("SATINALMA yalnız GÖNDERDİKLERİM'i gösterir ve yalnız o ucu çağırır", async () => {
    wrap(<InquiriesView portal="satinalma" />);
    expect(await screen.findByText("Fiyat bilgisi rica ederim.")).toBeInTheDocument();
    expect(screen.queryByText("Gelen")).toBeNull();
    const urls = h.get.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/sent"))).toBe(true);
    expect(urls.some((u) => u.includes("/received"))).toBe(false);
  });
});

describe("PanelInquiryDialog", () => {
  const seed = {
    productName: "Dağıtım Panosu",
    unit: "adet",
    categoryId: "39121600",
    keywords: ["pano"],
    companyName: "İkinci Firma",
  };

  function open() {
    return wrap(
      <PanelInquiryDialog
        open
        onClose={() => undefined}
        companySlug="ikinci-firma"
        productSlug="pano"
        productName="Dağıtım Panosu"
        companyName="İkinci Firma"
        seed={seed}
      />,
    );
  }

  it("KİMLİK alanı sormaz ve auth'lu uca gönderir", async () => {
    // Canlıdaki hata buydu: giriş yapmış kullanıcı ürün sayfasında misafir
    // formuyla (ad/e-posta/firma/telefon) karşılaşıyordu.
    h.post.mockResolvedValue({ data: { id: "i9" } });
    const user = userEvent.setup();
    open();

    expect(screen.queryByLabelText(/e-posta/i)).toBeNull();
    expect(screen.queryByLabelText(/ad soyad/i)).toBeNull();

    await user.type(
      screen.getByLabelText(/Mesajınız/),
      "Bu ürün için fiyat ve teslim süresi bilgisi rica ederim.",
    );
    await user.click(screen.getByRole("button", { name: "Talebi gönder" }));

    await waitFor(() => expect(h.post).toHaveBeenCalled());
    const [url, body] = h.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/company/inquiries");
    expect(body.companySlug).toBe("ikinci-firma");
    expect(body.productSlug).toBe("pano");
    expect(Object.keys(body)).not.toContain("email");
  });

  it("'talebime ekle' ürünü tohum olarak taşır — AI taslağından AYRI anahtar", async () => {
    const user = userEvent.setup();
    open();
    await user.click(
      screen.getByRole("button", { name: "Bu ürünü satın alma talebime ekle" }),
    );
    expect(JSON.parse(sessionStorage.getItem(PRODUCT_SEED_KEY) ?? "null")).toEqual(
      seed,
    );
    // AI yolunun anahtarı KİRLENMEZ: aynı anahtar olsaydı sihirbaz tohumu
    // AiTenderExtractResult sanıp "AI doldurdu" bandı basardı.
    expect(sessionStorage.getItem("ai-tender-draft")).toBeNull();
    expect(h.push).toHaveBeenCalledWith(
      "/company/satinalma/taleplerim/yeni?urun=1",
    );
  });
});
