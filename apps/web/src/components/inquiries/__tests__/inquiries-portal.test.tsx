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

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn(), canReply: true, toastError: vi.fn() }));

// Yanıt kutusu "Bilgi taleplerini yanıtlama" iznine kapılı (API aynası).
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => h.canReply,
  useCompanyAuth: () => ({ user: null, company: null }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: h.toastError, info: vi.fn(), warning: vi.fn() },
}));
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
  h.canReply = true;
  h.toastError.mockReset();
  h.get.mockReset();
  h.post.mockReset();
  h.push.mockReset();
  h.get.mockImplementation((url: string) =>
    url.includes("received")
      ? Promise.resolve({ data: RECEIVED })
      : Promise.resolve({ data: SENT }),
  );
});

describe("InquiriesView — ücretsiz satıcı anonim görünüm (2026-09-06)", () => {
  it("locked: kilit kartı + kimlik gizli + yanıt kutusu yok; soru ve alıcı şehri görünür", async () => {
    h.get.mockImplementation((url: string) =>
      url.includes("received")
        ? Promise.resolve({
            data: {
              total: 1,
              locked: true,
              items: [
                {
                  ...RECEIVED.items[0],
                  name: null,
                  companyName: null,
                  anonymous: true,
                  buyerCity: "İzmir",
                  buyerActivities: ["MANUFACTURER"],
                },
              ],
            },
          })
        : Promise.resolve({ data: SENT }),
    );
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText(/kim sorduğu ve yanıt Silver ile açılır/)).toBeInTheDocument();
    expect(screen.getByText("Stok var mı?")).toBeInTheDocument();
    expect(screen.getByText(/İzmir/)).toBeInTheDocument();
    expect(screen.queryByText("Ayşe Demir")).toBeNull();
    expect(screen.queryByPlaceholderText("Yanıtınızı yazın…")).toBeNull();
    expect(screen.getByRole("link", { name: "Silver paketine geç" })).toHaveAttribute("href", "/company/premium");
  });
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

describe("InquiriesView — gelen kutusu düzeni (2026-09-09)", () => {
  it("satıcı: liste satırı + seçili konuşma, süzgeç sayaçları, yanıt kutusu; arama süzer", async () => {
    const user = userEvent.setup();
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText("Stok var mı?")).toBeInTheDocument(); // balon
    // Liste satırı "Kim: mesaj" biçiminde — balonla aynı dize değil.
    expect(screen.getByText("Ayşe Demir: Stok var mı?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Yanıt bekleyen/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /^Yanıtlanan/ })).toHaveTextContent("0");
    expect(screen.getByPlaceholderText("Yanıtınızı yazın…")).toBeInTheDocument();
    expect(screen.getByText("Kayıtlı kullanıcı")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Bilgi taleplerinde ara"), "olmayan ürün");
    expect(screen.getByText("Bu süzgeçte talep yok.")).toBeInTheDocument();
  });

  it("'Yanıtla' satırı telefonda da AI düğmesinin sütunundan çekilir (arayüz testi kapanış S-SELL NEW-2)", async () => {
    wrap(<InquiriesView portal="satis" />);
    const row = (await screen.findByRole("button", { name: "Yanıtla" })).parentElement!;
    // Eskiden yalnız `sm:pr-14`: 390 px'te düğme "Yanıtla"nın sağını örtüyordu.
    expect(row).toHaveClass("pr-16", "sm:pr-14");
  });

  it("alıcı: yanıt bekleniyor notu, ürün bağlantısı satıcı sayfasına, yanıt kutusu YOK", async () => {
    wrap(<InquiriesView portal="satinalma" />);
    expect(await screen.findByText("Fiyat bilgisi rica ederim.")).toBeInTheDocument();
    expect(screen.getByText(/Satıcı henüz yanıtlamadı/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dağıtım Panosu" })).toHaveAttribute("href", "/company/satinalma/urunler/ikinci-firma/pano");
    expect(screen.queryByPlaceholderText("Yanıtınızı yazın…")).toBeNull();
  });
});

describe("InquiriesView — gelen talepler sayfalı (derin denetim MU-25)", () => {
  it("21. talep 'daha eski talepleri yükle' ile gelir; sayaçlar sunucu toplamından", async () => {
    const mk = (n: number) => ({
      ...RECEIVED.items[0],
      id: `r${n}`,
      message: `Soru ${n}`,
    });
    h.get.mockImplementation((url: string, cfg?: { params?: { page?: number } }) => {
      if (!url.includes("received")) return Promise.resolve({ data: SENT });
      const page = cfg?.params?.page ?? 1;
      return Promise.resolve({
        data:
          page === 1
            ? { total: 21, openCount: 18, items: Array.from({ length: 20 }, (_, i) => mk(i + 1)) }
            : { total: 21, openCount: 18, items: [mk(21)] },
      });
    });
    const user = userEvent.setup();
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText("Ayşe Demir: Soru 1")).toBeInTheDocument();
    expect(screen.queryByText("Ayşe Demir: Soru 21")).toBeNull();
    // Sayaçlar yüklü 20 satırdan değil sunucu toplamından.
    expect(screen.getByRole("button", { name: /^Tümü/ })).toHaveTextContent("21");
    expect(screen.getByRole("button", { name: /^Yanıt bekleyen/ })).toHaveTextContent("18");
    expect(screen.getByRole("button", { name: /^Yanıtlanan/ })).toHaveTextContent("3");

    await user.click(screen.getByRole("button", { name: /Daha eski talepleri yükle/ }));
    expect(await screen.findByText("Ayşe Demir: Soru 21")).toBeInTheDocument();
    const pages = h.get.mock.calls
      .filter((c) => String(c[0]).includes("received"))
      .map((c) => (c[1] as { params?: { page?: number } } | undefined)?.params?.page);
    expect(pages).toEqual([1, 2]);
    // Hepsi yüklendi → düğme kalkar.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Daha eski talepleri yükle/ })).toBeNull(),
    );
  });
});

describe("InquiriesView — gonderilen talepler sayfali (derin denetim MU-25, gozden gecirme)", () => {
  it("alici: 21. talep 'daha eski talepleri yukle' ile gelir; sayaclar sunucu toplamindan", async () => {
    const mk = (n: number) => ({ ...SENT[0], id: `s${n}`, message: `Gonderilen ${n}` });
    h.get.mockImplementation((url: string, cfg?: { params?: { page?: number } }) => {
      if (!url.includes("sent")) return Promise.resolve({ data: RECEIVED });
      const page = cfg?.params?.page ?? 1;
      return Promise.resolve({
        data:
          page === 1
            ? { total: 21, openCount: 15, items: Array.from({ length: 20 }, (_, i) => mk(i + 1)) }
            : { total: 21, openCount: 15, items: [mk(21)] },
      });
    });
    const user = userEvent.setup();
    wrap(<InquiriesView portal="satinalma" />);
    expect(await screen.findByText("Siz: Gonderilen 1")).toBeInTheDocument();
    expect(screen.queryByText("Siz: Gonderilen 21")).toBeNull();
    expect(screen.getByRole("button", { name: /^Tümü/ })).toHaveTextContent("21");
    expect(screen.getByRole("button", { name: /^Yanıt bekleniyor/ })).toHaveTextContent("15");
    expect(screen.getByRole("button", { name: /^Yanıt gelen/ })).toHaveTextContent("6");

    await user.click(screen.getByRole("button", { name: /Daha eski talepleri yükle/ }));
    expect(await screen.findByText("Siz: Gonderilen 21")).toBeInTheDocument();
    const pages = h.get.mock.calls
      .filter((c) => String(c[0]).includes("sent"))
      .map((c) => (c[1] as { params?: { page?: number } } | undefined)?.params?.page);
    expect(pages).toEqual([1, 2]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Daha eski talepleri yükle/ })).toBeNull(),
    );
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

describe("InquiriesView — hata ve çift gönderim (derin denetim LU-29)", () => {
  it("sorgu hata verince boş durum değil hata kutusu + Tekrar dene basılır", async () => {
    const user = userEvent.setup();
    h.get.mockRejectedValueOnce(new Error("500"));
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Henüz bilgi talebi yok")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByText("Stok var mı?")).toBeInTheDocument();
  });

  it("Ctrl+Enter art arda basılsa da istek dönmeden ikinci yanıt gitmez", async () => {
    const user = userEvent.setup();
    let resolve!: (v: unknown) => void;
    h.post.mockImplementation(() => new Promise((r) => (resolve = r)));
    wrap(<InquiriesView portal="satis" />);
    const box = await screen.findByPlaceholderText("Yanıtınızı yazın…");
    await user.type(box, "Stok var, teslim 3 gün.");
    await user.keyboard("{Control>}{Enter}{Enter}{Enter}{/Control}");
    expect(h.post).toHaveBeenCalledTimes(1);
    resolve({ data: { id: "rp1", body: "x", createdAt: new Date().toISOString() } });
    await waitFor(() => expect(box).toHaveValue(""));
    expect(h.post).toHaveBeenCalledTimes(1);
  });
});

describe("InquiriesView — arayüz testi D-112/D-131/D-238/D-284", () => {
  it("süzgeç düğme grubu: tablist/tab değil aria-pressed (D-238)", async () => {
    const user = userEvent.setup();
    wrap(<InquiriesView portal="satis" />);
    await screen.findByText("Stok var mı?");
    expect(screen.queryByRole("tablist")).toBeNull();
    const open = screen.getByRole("button", { name: /^Yanıt bekleyen/ });
    expect(open).toHaveAttribute("aria-pressed", "false");
    await user.click(open);
    expect(open).toHaveAttribute("aria-pressed", "true");
  });

  it("boş durum gerçek düğme adını söyler: 'Bilgi iste' (D-238)", async () => {
    h.get.mockImplementation(() => Promise.resolve({ data: { total: 0, items: [] } }));
    wrap(<InquiriesView portal="satinalma" />);
    expect(await screen.findByText(/'Bilgi iste' ile soru gönderin/)).toBeInTheDocument();
  });

  it("satıcıda ürün bağlantısı ürünün kendisini açar (?urun=<id>) (D-131/D-284)", async () => {
    h.get.mockImplementation((url: string) =>
      url.includes("received")
        ? Promise.resolve({
            data: { ...RECEIVED, items: [{ ...RECEIVED.items[0], product: { id: "prod-1", name: "Dağıtım Panosu", slug: "pano" } }] },
          })
        : Promise.resolve({ data: SENT }),
    );
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByRole("link", { name: "Dağıtım Panosu" })).toHaveAttribute(
      "href",
      "/company/satis/urunlerim?urun=prod-1",
    );
  });

  it("yanıt izni olmayan kullanıcıya açıklama basılır, yanıt kutusu yok (D-284)", async () => {
    h.canReply = false;
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByText(/yanıtlamak için “Bilgi taleplerini yanıtlama” izni gerekir/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Yanıtınızı yazın…")).toBeNull();
  });

  it("sunucu hatasında tek toast: yerel toast yakalayıcının bastığını tekrarlamaz (D-284)", async () => {
    const user = userEvent.setup();
    const err = Object.assign(new Error("403"), {
      isAxiosError: true,
      response: { status: 403, data: { message: "Yetkiniz yok" } },
    });
    h.post.mockRejectedValue(err);
    wrap(<InquiriesView portal="satis" />);
    await user.type(await screen.findByPlaceholderText("Yanıtınızı yazın…"), "Stok var.");
    await user.click(screen.getByRole("button", { name: "Yanıtla" }));
    await waitFor(() => expect(h.post).toHaveBeenCalled());
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("kilit kartında alım talebi dipnotu yok (D-284)", async () => {
    h.get.mockImplementation((url: string) =>
      url.includes("received")
        ? Promise.resolve({ data: { ...RECEIVED, locked: true, items: [{ ...RECEIVED.items[0], name: null, companyName: null, anonymous: true }] } })
        : Promise.resolve({ data: SENT }),
    );
    wrap(<InquiriesView portal="satis" />);
    expect(await screen.findByRole("link", { name: "Silver paketine geç" })).toBeInTheDocument();
    expect(screen.queryByText(/bağlantılı firmaların taleplerini ücretsiz/)).toBeNull();
  });

  it("arama yalnız yüklenenlerde: eski kayıtlar yüklenmediyse ipucu basılır (D-112)", async () => {
    const mk = (n: number) => ({ ...RECEIVED.items[0], id: `r${n}`, message: `Soru ${n}` });
    h.get.mockImplementation((url: string) =>
      url.includes("received")
        ? Promise.resolve({ data: { total: 40, openCount: 40, items: Array.from({ length: 20 }, (_, i) => mk(i + 1)) } })
        : Promise.resolve({ data: SENT }),
    );
    const user = userEvent.setup();
    wrap(<InquiriesView portal="satis" />);
    await screen.findByText("Ayşe Demir: Soru 1");
    expect(screen.queryByText(/yalnız yüklenen/)).toBeNull();
    await user.type(screen.getByLabelText("Bilgi taleplerinde ara"), "en eski");
    expect(screen.getByText("Bu süzgeçte talep yok.")).toBeInTheDocument();
    expect(screen.getByText(/yalnız yüklenen 20\/40 talepte/)).toBeInTheDocument();
  });
});

