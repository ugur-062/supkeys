// @vitest-environment jsdom
import type { ListingDetail } from "@/hooks/use-company-listings";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  /** Detay isteği hatası (ör. 403 TIER_REQUIRED) — kilit kartı testi. */
  error: null as unknown,
  isLoading: false,
  mutateAsync: vi.fn(),
  /** Belge yükleme (useUploadBidDoc.mutateAsync). */
  uploadAsync: vi.fn(),
  /** useBidDocuments verisi (mevcut belgeler). */
  docs: [] as unknown[],
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
  const React = await import("react");
  return {
    ...mod,
    useListingDetail: () => ({ data: h.detail, isLoading: h.isLoading, error: h.error }),
    // Gerçek useMutation gibi durumlu: mutateAsync başarıyla dönünce
    // isSuccess true KALIR (reset yok) — Y-15 takılma senaryosu için şart.
    usePlaceBid: function usePlaceBidMock() {
      const [st, setSt] = React.useState({ isPending: false, isSuccess: false });
      return {
        ...st,
        mutateAsync: async (v: unknown) => {
          setSt({ isPending: true, isSuccess: false });
          try {
            const r = await h.mutateAsync(v);
            setSt({ isPending: false, isSuccess: true });
            return r;
          } catch (e) {
            setSt({ isPending: false, isSuccess: false });
            throw e;
          }
        },
      };
    },
  };
});
vi.mock("@/hooks/use-bid-documents", () => ({
  useBidDocuments: () => ({ data: h.docs }),
  useUploadBidDoc: () => ({ mutateAsync: h.uploadAsync, isPending: false }),
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
  h.docs = [];
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

  it("yeni tura taşınan RFQ teklifi (canReviseCarried) → form açık, bir kez revize notu; taslak ve dosya alanı kapalı (MU-20)", () => {
    h.detail = baseDetail({
      myBid: {
        amount: "1000",
        status: "SUBMITTED",
        version: 1,
        note: null,
        canReviseCarried: true,
        items: [{ itemId: "i1", unitPrice: "100" }],
      },
    } as Partial<ListingDetail>);
    render(<TeklifVerPage />);
    expect(screen.queryByText(/Teklif zaten verildi/)).toBeNull();
    expect(screen.getByText(/Bu turda fiyatınızı bir kez revize edebilirsiniz/)).toBeInTheDocument();
    expect(screen.getAllByText("Yeni Teklif Ver").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /taslak olarak kaydet/i })).toBeNull();
    expect(screen.queryByLabelText("Teklif dosyası seç")).toBeNull();
    expect(
      screen.getByText(/Yeni tura taşınan teklifinizin belgeleri bu turda değiştirilemez/),
    ).toBeInTheDocument();
  });

  it("herkese açık talep ücretsiz üyeye 403 TIER_REQUIRED → 'bulunamadı' DEĞİL Silver kilit kartı", () => {
    h.detail = undefined;
    h.error = { response: { status: 403, data: { code: "TIER_REQUIRED", minTier: "SILVER" } } };
    try {
      render(<TeklifVerPage />);
      expect(screen.getByText(/Bu herkese açık talebe teklif Silver paketiyle açılır/)).toBeInTheDocument();
      expect(screen.queryByText(/bulunamadı/)).toBeNull();
      expect(screen.getByRole("link", { name: "Silver paketine geç" })).toHaveAttribute("href", "/company/premium");
    } finally {
      h.error = null;
    }
  });

  it("ülkesine açık olmayan talep 403 COUNTRY_NOT_ELIGIBLE → 'bulunamadı' DEĞİL ülke kartı (2026-09-27)", () => {
    h.detail = undefined;
    h.error = { response: { status: 403, data: { code: "COUNTRY_NOT_ELIGIBLE", targetCountries: ["TR"] } } };
    try {
      render(<TeklifVerPage />);
      expect(screen.getByRole("heading", { name: "Bu talep firmanızın ülkesine açık değil" })).toBeInTheDocument();
      expect(screen.getByText(/yalnız Türkiye merkezli tedarikçilere/)).toBeInTheDocument();
      expect(screen.queryByText(/bulunamadı/)).toBeNull();
    } finally {
      h.error = null;
    }
  });

  it("teklif hakkı yok (ücretsiz, bağsız) → Silver kapısı", () => {
    h.detail = baseDetail({ canBid: false });
    render(<TeklifVerPage />);
    expect(screen.getByText(/Teklif için Silver paketi gerekir/)).toBeInTheDocument();
  });

  it("kapalı alım talebi → engellenir", () => {
    h.detail = baseDetail({ status: "CLOSED" });
    render(<TeklifVerPage />);
    expect(
      screen.getByText("Bu alım talebine artık teklif verilemez"),
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

  it("kapalı zarf RFQ kart görünümü: muadil beyanı yapılabilir, payload'a gider (derin denetim Y-16)", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "DRAFT" });
    render(<TeklifVerPage />);

    // Alıcı muadile izin verdi (alternativeAllowed varsayılanı true) →
    // kart görünümünde de onay kutusu çıkar (eskiden yalnız pazarlık
    // çalışma masasında vardı).
    await user.click(
      screen.getByRole("checkbox", {
        name: /Muadil \(eşdeğer\) ürün teklif ediyorum/,
      }),
    );
    await user.type(screen.getByLabelText("Çelik Boru teklif edilen marka"), "FAG");
    await user.type(
      screen.getByLabelText("Çelik Boru teklif edilen parça no"),
      "6204-C",
    );
    await user.type(screen.getByLabelText("Birim Fiyat"), "90");
    await user.click(
      screen.getByRole("button", { name: "Taslak Olarak Kaydet" }),
    );
    expect(h.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            itemId: "i1",
            isAlternative: true,
            offeredBrand: "FAG",
            offeredMpn: "6204-C",
          }),
        ],
      }),
    );
  });

  it("muadil işaretli ama marka ve parça no boş → gönderim engellenir (derin denetim LU-15)", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText("Birim Fiyat"), "90");
    await user.click(
      screen.getByRole("checkbox", {
        name: /Muadil \(eşdeğer\) ürün teklif ediyorum/,
      }),
    );
    expect(
      screen.getByText(/muadil ürün teklif ediyorsanız marka veya parça numarası girin/),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Çelik Boru teklif edilen marka"), "FAG");
    expect(
      screen.queryByText(/muadil ürün teklif ediyorsanız marka veya parça numarası girin/),
    ).toBeNull();
  });

  it("alıcı muadile izin vermediyse kart görünümünde muadil alanı çıkmaz", () => {
    const base = baseDetail();
    h.detail = {
      ...base,
      items: base.items!.map((it) => ({ ...it, alternativeAllowed: false })),
    };
    render(<TeklifVerPage />);
    expect(
      screen.queryByRole("checkbox", { name: /Muadil \(eşdeğer\)/ }),
    ).toBeNull();
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

describe("TeklifVerPage — dosyalı gönderim (derin denetim Y-15, X22)", () => {
  const pdf = () =>
    new File(["%PDF-1.4"], "teklif.pdf", { type: "application/pdf" });

  /** Formu gönderilebilir doldurur + dosya ekler + onaylayıp gönderir. */
  async function fillAttachAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Birim Fiyat"), "150");
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(
      screen.getByLabelText("Çelik Boru teslim süresi"),
      "W3_4",
    );
    await user.upload(screen.getByLabelText("Teklif dosyası seç"), pdf());
    expect(screen.getByText("teklif.pdf")).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!,
    );
    await user.click(
      await screen.findByRole("button", { name: "Teklifi Gönder" }),
    );
  }

  it("ilk teklif: taslak kaydedilip yükleme düşerse ekran 'gönderildi'de takılmaz, form + bekleyen dosya geri gelir", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "DRAFT" });
    h.uploadAsync.mockRejectedValue(new Error("Sadece PDF, görsel veya Excel"));
    render(<TeklifVerPage />);

    await fillAttachAndSubmit(user);

    // Yalnız taslak adımı çalıştı; son gönderim yapılmadı.
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.mutateAsync).toHaveBeenCalledTimes(1);
    expect(h.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ asDraft: true }),
    );
    expect(h.push).not.toHaveBeenCalled();
    expect(screen.queryByText(/Teklifiniz gönderildi — alım talebi/)).toBeNull();
    // Form ve "listede kaldı" denen dosya görünür → tekrar denenebilir.
    expect(screen.getByText("teklif.pdf")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Teklif Gönder" })[0],
    ).toBeEnabled();
  });

  it("taslak kaydet: yükleme düşerse ekran 'gönderildi' göstermez, form kalır", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "DRAFT" });
    h.uploadAsync.mockRejectedValue(new Error("ağ hatası"));
    render(<TeklifVerPage />);

    await user.type(screen.getByLabelText("Birim Fiyat"), "90");
    await user.upload(screen.getByLabelText("Teklif dosyası seç"), pdf());
    await user.click(
      screen.getByRole("button", { name: "Taslak Olarak Kaydet" }),
    );

    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    // Üretim dalı: taslak kaydedildi, dosyalar bekliyor → info mesajı; catch'e
    // düşüp "Taslak kaydedilemedi" basılmamalı, success de çıkmamalı.
    await waitFor(() =>
      expect(h.toast.info).toHaveBeenCalledWith(
        expect.stringContaining("yüklenemeyen dosyalar listede"),
      ),
    );
    expect(h.toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining("Taslak kaydedilemedi"),
    );
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText(/Teklifiniz gönderildi — alım talebi/)).toBeNull();
    expect(screen.getByText("teklif.pdf")).toBeInTheDocument();
    expect(h.push).not.toHaveBeenCalled();
  });

  it("başarılı dosyalı ilk teklif: taslak → yükleme → gönderim, sonra 'gönderildi' + yönlendirme", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "SUBMITTED" });
    h.uploadAsync.mockResolvedValue({});
    render(<TeklifVerPage />);

    await fillAttachAndSubmit(user);

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/l1"));
    expect(h.mutateAsync.mock.calls.map((c) => c[0].asDraft)).toEqual([
      true,
      false,
    ]);
    expect(h.uploadAsync).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Teklifiniz gönderildi — alım talebi/),
    ).toBeInTheDocument();
  });

  it("elenmiş (LOST) teklife dosyalı yeniden teklif: önce taslağa çekilir, sonra yüklenir ve gönderilir", async () => {
    const user = userEvent.setup();
    h.detail = baseDetail({
      myBid: {
        amount: "1000",
        status: "LOST",
        version: 1,
        note: null,
        items: [{ itemId: "i1", unitPrice: "100" }],
        answers: [{ questionId: "q1", value: "Türkiye" }],
      },
    });
    h.mutateAsync.mockResolvedValue({ status: "SUBMITTED" });
    h.uploadAsync.mockResolvedValue({});
    render(<TeklifVerPage />);

    await user.selectOptions(
      screen.getByLabelText("Çelik Boru teslim süresi"),
      "W3_4",
    );
    await user.upload(screen.getByLabelText("Teklif dosyası seç"), pdf());
    await user.click(
      screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!,
    );
    await user.click(
      await screen.findByRole("button", { name: "Teklifi Gönder" }),
    );

    await waitFor(() => expect(h.push).toHaveBeenCalled());
    const drafts = h.mutateAsync.mock.calls.map((c) => c[0].asDraft);
    expect(drafts).toEqual([true, false]);
    // Taslak adımı yüklemeden ÖNCE çalıştı.
    expect(h.mutateAsync.mock.invocationCallOrder[0]!).toBeLessThan(
      h.uploadAsync.mock.invocationCallOrder[0]!,
    );
  });

  it("sürükle-bırak desteklenmeyen türü (.docx) listeye almaz, uyarır", () => {
    render(<TeklifVerPage />);
    const docx = new File(["x"], "mektup.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const zone = screen.getByLabelText("Teklif dosyası seç").closest("label")!;
    fireEvent.drop(zone, { dataTransfer: { files: [docx, pdf()] } });
    expect(h.toast.error).toHaveBeenCalledWith(
      expect.stringContaining("mektup.docx"),
    );
    expect(screen.queryByText("mektup.docx")).toBeNull();
    expect(screen.getByText("teklif.pdf")).toBeInTheDocument();
  });

  it("pazarlık yeni tur (SUBMITTED): dosya alanı yerine not; mevcut belgede sil düğmesi yok", () => {
    h.detail = baseDetail({
      myBid: {
        amount: "1000",
        status: "SUBMITTED",
        version: 1,
        note: null,
        items: [{ itemId: "i1", unitPrice: "100" }],
      },
      english: { isEnglishAuction: true },
    } as Partial<ListingDetail>);
    h.docs = [
      { id: "d1", fileName: "eski.pdf", kind: "TEKLIF_MEKTUBU", url: "#", mine: true },
    ];
    render(<TeklifVerPage />);
    expect(screen.queryByLabelText("Teklif dosyası seç")).toBeNull();
    expect(
      screen.getByText(/Pazarlıkta gönderilmiş teklifin belgeleri değiştirilemez/),
    ).toBeInTheDocument();
    expect(screen.getByText("eski.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eski\.pdf.*sil/i })).toBeNull();
  });

  it("taslak teklifte mevcut belge silinebilir", () => {
    h.detail = baseDetail({
      myBid: { amount: "1000", status: "DRAFT", version: 1, note: null },
    });
    h.docs = [
      { id: "d1", fileName: "eski.pdf", kind: "TEKLIF_MEKTUBU", url: "#", mine: true },
    ];
    render(<TeklifVerPage />);
    expect(screen.getByRole("button", { name: /eski\.pdf/ })).toBeInTheDocument();
  });
});
