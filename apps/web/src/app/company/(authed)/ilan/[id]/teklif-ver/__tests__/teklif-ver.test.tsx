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
}));
vi.mock("sonner", () => ({ toast: h.toast }));
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
    masked: false,
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
      screen.getByText(/Teklif zaten verildi \(v2\)/),
    ).toBeInTheDocument();
  });

  it("premium değil → premium kapısı", () => {
    h.detail = baseDetail({ canBid: false, masked: true, owner: null });
    render(<TeklifVerPage />);
    expect(
      screen.getByText("Teklif için premium üyelik gerekir"),
    ).toBeInTheDocument();
  });

  it("kapalı ihale → engellenir", () => {
    h.detail = baseDetail({ status: "CLOSED" });
    render(<TeklifVerPage />);
    expect(
      screen.getByText("Bu ihaleye artık teklif verilemez"),
    ).toBeInTheDocument();
  });
});

describe("TeklifVerPage — form", () => {
  it("kalem satırı: hedef ipucu + soru + kalem teslim tarihi alanı", () => {
    render(<TeklifVerPage />);
    expect(screen.getByText(/Hedef: 120/)).toBeInTheDocument();
    expect(screen.getByText(/Menşei ülke\?/)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Kalem Teslim Tarihi (opsiyonel)"),
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

    // Teslim tarihi + geçerlilik dolu değil / soru cevapsız → buton disabled.
    const submitBtn = screen.getByRole("button", { name: "Teklif Gönder" });
    expect(submitBtn).toBeDisabled();
    expect(
      screen.getByText(/zorunlu soru cevaplanmadı/),
    ).toBeInTheDocument();

    // Eksikleri tamamla → aktifleşir.
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.type(
      screen.getByLabelText("Genel Teslim Tarihi *"),
      new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    );
    expect(submitBtn).toBeEnabled();
  });

  it("kalem opt-out: X → 'teklif verilmeyecek', geri alınabilir", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);

    await user.click(
      screen.getByRole("button", { name: "Bu kaleme teklif verme" }),
    );
    expect(
      screen.getByText("Bu kaleme teklif verilmeyecek."),
    ).toBeInTheDocument();
    expect(screen.getByText("Fiyatlandırılan kalem 0/1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Teklif ver" }));
    expect(screen.getByLabelText("Birim Fiyat")).toBeInTheDocument();
  });

  it("gönderim onay dialog'u → payload kalem teslim tarihi + cevap içerir", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "SUBMITTED" });
    render(<TeklifVerPage />);

    await user.type(screen.getByLabelText("Birim Fiyat"), "150");
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    const itemDate = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await user.type(
      screen.getByLabelText("Kalem Teslim Tarihi (opsiyonel)"),
      itemDate,
    );
    await user.type(
      screen.getByLabelText("Genel Teslim Tarihi *"),
      new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
    );

    await user.click(screen.getByRole("button", { name: "Teklif Gönder" }));
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
            deliveryDate: itemDate,
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
    expect(screen.getByLabelText("Birim Fiyat")).toHaveValue(100);
    expect(screen.getByLabelText(/Menşei ülke/)).toHaveValue("Türkiye");
  });
});
