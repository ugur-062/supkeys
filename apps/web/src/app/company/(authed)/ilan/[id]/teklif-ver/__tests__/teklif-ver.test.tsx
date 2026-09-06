// @vitest-environment jsdom
import type { ListingDetail } from "@/hooks/use-company-listings";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  isLoading: false,
  mutateAsync: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => async () => true,
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({ data: h.detail, isLoading: h.isLoading }),
    usePlaceBid: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
  };
});
vi.mock("@/hooks/use-bid-documents", () => ({
  useBidDocuments: () => ({ data: [] }),
  useUploadBidDoc: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBidDoc: () => ({ mutate: vi.fn(), isPending: false }),
  BID_DOC_KINDS: [
    "TEKLIF_MEKTUBU",
    "TEKNIK_DOKUMAN",
    "REFERANS",
    "KATALOG",
    "TEMINAT",
    "DIGER",
  ],
  BID_DOC_SELECTABLE_KINDS: [
    "TEKLIF_MEKTUBU",
    "TEKNIK_DOKUMAN",
    "REFERANS",
    "KATALOG",
    "DIGER",
  ],
  BID_DOC_KIND_LABELS: {
    TEKLIF_MEKTUBU: "Teklif Mektubu",
    TEKNIK_DOKUMAN: "Teknik Doküman",
    REFERANS: "Referans / İş Bitirme",
    KATALOG: "Katalog / Broşür",
    TEMINAT: "Teminat Mektubu",
    DIGER: "Diğer",
  },
}));

import TeklifVerPage from "../page";

function baseDetail(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0001",
    type: "ALIM",
    title: "Çelik Alımı",
    status: "OPEN",
    isOwner: false,
    canBid: true,
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY"],
    requireAllItems: false,
    closesAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    owner: { name: "Alıcı A.Ş." },
    items: [
      {
        id: "i1",
        lineNo: 1,
        name: "Çelik Boru",
        description: null,
        quantity: "10",
        unit: "adet",
        targetPrice: "120",
        questions: [
          {
            id: "q1",
            text: "Menşei ülke?",
            answerType: "TEXT",
            required: true,
          },
        ],
      },
    ],
    myBid: null,
    ...over,
  } as ListingDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.detail = baseDetail();
  h.isLoading = false;
});

describe("TeklifVerPage — kapılar", () => {
  it("SUBMITTED RFQ → düzenleme engellenir", () => {
    h.detail = baseDetail({
      myBid: { amount: "1000", status: "SUBMITTED", version: 2, note: null },
    });
    render(<TeklifVerPage />);
    expect(
      screen.getByText(/Teklif zaten verildi/),
    ).toBeInTheDocument();
  });

  it("teklif hakkı yok (ücretsiz, bağsız) → Silver kapısı", () => {
    h.detail = baseDetail({ canBid: false });
    render(<TeklifVerPage />);
    expect(screen.getByText(/Teklif için Silver paketi gerekir/)).toBeInTheDocument();
  });

  it("kapalı satın alma talebi → engellenir", () => {
    h.detail = baseDetail({ status: "CLOSED" });
    render(<TeklifVerPage />);
    expect(
      screen.getByText("Bu satın alma talebine artık teklif verilemez"),
    ).toBeInTheDocument();
  });
});

describe("TeklifVerPage — form", () => {
  it("kalem satırı: hedef ipucu + soru + kalem teslim süresi alanı", () => {
    render(<TeklifVerPage />);
    expect(screen.getByText(/Hedef: 120/)).toBeInTheDocument();
    expect(screen.getByText(/Menşei ülke\?/)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Çelik Boru teslim süresi"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 soru")).toBeInTheDocument();
  });

  it("fiyat girilince toplam + doluluk güncellenir; zorunlu soru gönderimi bloklar", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);

    await user.type(screen.getByLabelText("Birim Fiyat"), "150");
    // 150 × 10 adet = 1.500
    expect(screen.getAllByText(/1\.500/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Fiyatlandırılan kalem 1/1")).toBeInTheDocument();

    // Teslim süresi + geçerlilik dolu değil / soru cevapsız → buton disabled.
    // Masaüstü + mobil yapışkan çubukta iki eş isimli buton var — ilki (masaüstü).
    const submitBtn = screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!;
    expect(submitBtn).toBeDisabled();
    expect(
      screen.getByText(/zorunlu soru cevaplanmadı/),
    ).toBeInTheDocument();

    // Eksikleri tamamla → aktifleşir.
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(
      screen.getByLabelText("Genel teslim süresi"),
      "W1_2",
    );
    expect(submitBtn).toBeEnabled();
  });

  it("kalem opt-out: etiketli anahtar → 'teklif verilmeyecek', 'Kalemi geri ekle' ile döner", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);

    await user.click(
      screen.getByRole("button", { name: /Bu kaleme teklif vermiyorum/ }),
    );
    expect(
      screen.getByText("Bu kaleme teklif verilmeyecek."),
    ).toBeInTheDocument();
    expect(screen.getByText("Fiyatlandırılan kalem 0/1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kalemi geri ekle" }));
    expect(screen.getByLabelText("Birim Fiyat")).toBeInTheDocument();
  });

  it("gönderim onay dialog'u → payload kalem teslim süresi + cevap içerir", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "SUBMITTED" });
    render(<TeklifVerPage />);

    await user.type(screen.getByLabelText("Birim Fiyat"), "150");
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(
      screen.getByLabelText("Çelik Boru teslim süresi"),
      "W3_4",
    );
    // Kalemin kendi teslim süresi girildi → genel teslim süresi alanı artık
    // "gerek yok" notuna döner (zorunlu değil); doldurulmasına gerek yok.
    expect(
      screen.getByText(/genel süreye gerek yok/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!,
    );
    // Onay dialog'u açılır → onayla. ("Toplam Teklif" sidebar'da da olduğundan
    // dialog varlığını onay butonuyla doğruluyoruz.)
    const confirmBtn = await screen.findByRole("button", {
      name: "Teklifi Gönder",
    });
    await user.click(confirmBtn);

    expect(h.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        asDraft: false,
        items: [
          expect.objectContaining({
            itemId: "i1",
            unitPrice: 150,
            deliveryTime: "W3_4",
            answers: [{ questionId: "q1", value: "Türkiye" }],
          }),
        ],
      }),
    );
    expect(h.push).toHaveBeenCalledWith("/company/ilan/l1");
  });

  it("taslak kaydet doğrulamasız çalışır", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "DRAFT" });
    render(<TeklifVerPage />);

    await user.type(screen.getByLabelText("Birim Fiyat"), "90");
    await user.click(
      screen.getByRole("button", { name: "Taslak Olarak Kaydet" }),
    );
    expect(h.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ asDraft: true }),
    );
    expect(h.toast.success).toHaveBeenCalledWith("Taslak kaydedildi");
  });

  it("eleme sonrası yeniden teklif: başlık + gerekçe bandı + seed", () => {
    h.detail = baseDetail({
      myBid: {
        amount: "1000",
        status: "LOST",
        version: 1,
        note: "eski not",
        eliminationReason: "Fiyat yüksek",
        items: [{ itemId: "i1", unitPrice: "100" }],
        answers: [{ questionId: "q1", value: "Türkiye" }],
      },
    });
    render(<TeklifVerPage />);
    expect(screen.getByText("Yeniden Teklif Ver")).toBeInTheDocument();
    expect(screen.getByText(/Fiyat yüksek/)).toBeInTheDocument();
    // Önceki fiyat + cevap tohumlanmış.
    // MoneyInput text-tabanlı (madde 21) — değer string olarak okunur.
    expect(screen.getByLabelText("Birim Fiyat")).toHaveValue("100");
    expect(screen.getByLabelText(/Menşei ülke/)).toHaveValue("Türkiye");
  });
});
