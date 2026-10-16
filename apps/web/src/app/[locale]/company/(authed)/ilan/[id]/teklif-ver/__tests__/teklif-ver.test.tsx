// @vitest-environment jsdom
import type { ListingDetail } from "@/hooks/use-company-listings";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  /** Detay isteği hatası (ör. 403 TIER_REQUIRED) — kilit kartı testi. */
  error: null as unknown,
  isLoading: false,
  /** Çevrimdışı duraklama: istek yok, hata yok, veri yok. */
  paused: false,
  mutateAsync: vi.fn(),
  /** Belge yükleme (useUploadBidDoc.mutateAsync). */
  uploadAsync: vi.fn(),
  /** useBidDocuments verisi (mevcut belgeler). */
  docs: [] as unknown[],
  push: vi.fn(),
  refetch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  /** Onay penceresi (`useConfirm`) — varsayılan "evet". */
  confirm: vi.fn<(opts: unknown) => Promise<boolean>>(async () => true),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const React = await import("react");
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.detail,
      isLoading: h.isLoading,
      // Yanıt yok: yükleme ya da çevrimdışı duraklama (`isLoading` false).
      isPending: h.isLoading || h.paused,
      error: h.error,
      refetch: h.refetch,
    }),
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

import { useCompanyAuthStore } from "@/lib/company-auth/store";
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
  h.paused = false;
  h.docs = [];
  // Kaydedilmemiş form taslağı oturum deposunda — testler arasında taşınmasın.
  sessionStorage.clear();
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

  it("herkese açık talep doğrulanmamış firmaya 403 TIER_REQUIRED → 'bulunamadı' DEĞİL doğrulama kilit kartı", () => {
    h.detail = undefined;
    h.error = { response: { status: 403, data: { code: "TIER_REQUIRED", minTier: "SILVER" } } };
    try {
      render(<TeklifVerPage />);
      expect(screen.getByText(/Bu herkese açık talebe teklif firma doğrulamasıyla açılır/)).toBeInTheDocument();
      expect(screen.queryByText(/bulunamadı/)).toBeNull();
      expect(screen.queryByText(/Silver|Gold/)).toBeNull();
      expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
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

  it("teklif hakkı yok (doğrulanmamış, bağsız) → doğrulama kapısı, paket adı yok", () => {
    h.detail = baseDetail({ canBid: false });
    render(<TeklifVerPage />);
    expect(screen.getByText(/Teklif için firma doğrulaması gerekir/)).toBeInTheDocument();
    expect(screen.queryByText(/Silver|Gold/)).toBeNull();
  });

  it("teklif hakkı yok + doğrulaması reddedilmiş firma → tek eylem 'Yeniden başvurun', paket bağlantısı yok (webC-2; ücretsiz dönem)", () => {
    h.detail = baseDetail({ canBid: false });
    const prev = useCompanyAuthStore.getState().company;
    useCompanyAuthStore.setState({ company: { companyVerificationStatus: "REJECTED" } as never } as never);
    try {
      render(<TeklifVerPage />);
      expect(screen.getByRole("link", { name: "Yeniden başvurun" })).toHaveAttribute(
        "href",
        "/company/ayarlar/dogrulama",
      );
      expect(screen.queryByRole("link", { name: /Paket/i })).toBeNull();
    } finally {
      useCompanyAuthStore.setState({ company: prev } as never);
    }
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

    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
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
      screen.getByRole("button", { name: "Çelik Boru kalemine teklif vermiyorum" }),
    );
    expect(
      screen.getByText("Bu kaleme teklif verilmeyecek."),
    ).toBeInTheDocument();
    expect(screen.getByText("Fiyatlandırılan kalem 0/1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kalemi geri ekle" }));
    expect(screen.getByLabelText("Çelik Boru birim fiyat")).toBeInTheDocument();
  });

  it("gönderim onay dialog'u → payload kalem teslim süresi + cevap içerir", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "SUBMITTED" });
    render(<TeklifVerPage />);

    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
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
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "90");
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
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "90");
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

    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "90");
    await user.click(
      screen.getByRole("button", { name: "Taslak Olarak Kaydet" }),
    );
    expect(h.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ asDraft: true }),
    );
    expect(h.toast.success).toHaveBeenCalledWith("Taslak kaydedildi");
  });

  /**
   * Arayüz testi kapanış NUM: sayısal soru `type="number"` idi; Türkçe "12,50"
   * cevap "1250" gönderiliyordu (gönderilmiş teklif düzenlenemez). Geçerlilik
   * "0,5" → 5 gün. Artık yerel biçim çevrilir, geçersiz giriş kaydı durdurur.
   */
  it("sayısal soru cevabı TR '12,50' → '12.5'; geçerlilik '0,5' taslağı durdurur (NUM)", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ status: "DRAFT" });
    h.detail = baseDetail({
      items: [
        {
          ...baseDetail().items![0]!,
          questions: [{ id: "q2", text: "Et kalınlığı (mm)?", answerType: "NUMBER", required: false }],
        },
      ],
    } as Partial<ListingDetail>);
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "90");
    const answer = screen.getByLabelText(/Et kalınlığı/);
    await user.type(answer, "12,50");

    const validity = screen.getByDisplayValue("30");
    await user.clear(validity);
    await user.type(validity, "0,5");
    await user.click(screen.getByRole("button", { name: "Taslak Olarak Kaydet" }));
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/1.*365/));

    await user.clear(validity);
    await user.type(validity, "45");
    await user.click(screen.getByRole("button", { name: "Taslak Olarak Kaydet" }));
    expect(h.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        asDraft: true,
        validityDays: 45,
        items: [expect.objectContaining({ answers: [{ questionId: "q2", value: "12.5" }] })],
      }),
    );
  });

  it("sayısal soruda geçersiz cevap ('1.2.3') alan hatası + taslak durur (NUM)", async () => {
    const user = userEvent.setup();
    h.detail = baseDetail({
      items: [
        {
          ...baseDetail().items![0]!,
          questions: [{ id: "q2", text: "Et kalınlığı (mm)?", answerType: "NUMBER", required: false }],
        },
      ],
    } as Partial<ListingDetail>);
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "90");
    await user.type(screen.getByLabelText(/Et kalınlığı/), "1.2.3");
    expect(screen.getByText("Geçerli bir sayı girin (ör. 12,5).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Taslak Olarak Kaydet" }));
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining("Et kalınlığı"));
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
    expect(screen.getByLabelText("Çelik Boru birim fiyat")).toHaveValue("100");
    expect(screen.getByLabelText(/Menşei ülke/)).toHaveValue("Türkiye");
  });
});

describe("TeklifVerPage — dosyalı gönderim (derin denetim Y-15, X22)", () => {
  const pdf = () =>
    new File(["%PDF-1.4"], "teklif.pdf", { type: "application/pdf" });

  /** Formu gönderilebilir doldurur + dosya ekler + onaylayıp gönderir. */
  async function fillAttachAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
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

    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "90");
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

describe("TeklifVerPage — arayüz testi webC-01", () => {
  it("Y-09: fiyatlı kalemlerin hepsi tek yabancı birimdeyse toplam o birimde, çevrim notu onayda görünür", async () => {
    const user = userEvent.setup();
    h.detail = baseDetail({ allowedCurrencies: ["TRY", "EUR"] });
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "850");
    await user.selectOptions(screen.getByLabelText("Çelik Boru para birimi"), "EUR");
    // 850 € × 10 = 8.500,00 € — ana birim simgesiyle "8.500 ₺" DEĞİL.
    expect(screen.getAllByText("8.500,00 €").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/8\.500(,00)? ₺/)).toBeNull();
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(screen.getByLabelText("Genel teslim süresi"), "W1_2");
    await user.click(screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!);
    expect(
      await screen.findByText(/karşılaştırma toplamı ana birime \(TRY\)/),
    ).toBeInTheDocument();
  });

  it("D-048: para toplamı iki ondalıkla (12.345,60 ₺)", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "1234,56");
    expect(screen.getAllByText(/12\.345,60 ₺/).length).toBeGreaterThanOrEqual(1);
  });

  it("O-037: marka · parça no, muadil yasağı ve istenen teslim tarihi kalem satırında", () => {
    const base = baseDetail();
    h.detail = {
      ...base,
      items: base.items!.map((it) => ({
        ...it,
        brand: "SKF",
        mpn: "6205-2RS",
        alternativeAllowed: false,
        requiredByDate: "2026-11-15T00:00:00.000Z",
      })),
    };
    render(<TeklifVerPage />);
    expect(
      screen.getByText(/SKF · 6205-2RS · Muadil kabul edilmez · İstenen teslim: 15 Kas 2026/),
    ).toBeInTheDocument();
  });

  it("D-271: Enter, doğrulama temizse onay penceresini açar", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(screen.getByLabelText("Genel teslim süresi"), "W1_2");
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150{Enter}");
    expect(await screen.findByRole("button", { name: "Teklifi Gönder" })).toBeInTheDocument();
  });

  it("D-010: 365 günden uzun geçerlilik istemcide engellenir", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    const validity = screen.getByDisplayValue("30");
    await user.clear(validity);
    await user.type(validity, "400");
    expect(
      screen.getByText(/Geçerlilik süresi 1–365 gün arasında tam sayı olmalı\./),
    ).toBeInTheDocument();
  });

  it("D-028: doğrulama gereken teklifçide engelleyici kart; gönderim kapalı, taslak açık", async () => {
    const user = userEvent.setup();
    h.detail = baseDetail({ bidRequiresVerification: true });
    render(<TeklifVerPage />);
    expect(
      screen.getByRole("alert", { name: "Teklif göndermek için firma doğrulaması gerekir" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(screen.getByLabelText("Genel teslim süresi"), "W1_2");
    expect(screen.getAllByRole("button", { name: "Teklif Gönder" })[0]).toBeDisabled();
    expect(screen.getByText(/firma doğrulaması gerekir — şimdilik taslak/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taslak Olarak Kaydet" })).toBeEnabled();
  });

  it("D-274: kalemsiz talepte tutar etiketi birimli, 'Kalem 0' yok", () => {
    h.detail = baseDetail({ items: [] });
    render(<TeklifVerPage />);
    expect(screen.getByText("Tutar (TRY)")).toBeInTheDocument();
    expect(screen.queryByText("Kalem")).toBeNull();
  });

  it("yeniden doğrulama: kalemsiz talepte teslim süresi uyarısı kalemlerden söz etmez", () => {
    h.detail = baseDetail({ items: [] });
    render(<TeklifVerPage />);
    expect(screen.getByText(/^• Teslim süresi zorunlu\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/süre girmediğiniz kalemler/)).toBeNull();
  });

  it("yeniden doğrulama: kalem opt-out düğmelerinin erişilebilir adı kalem adını taşır", () => {
    const first = baseDetail().items![0]!;
    h.detail = baseDetail({
      items: [first, { ...first, id: "i2", lineNo: 2, name: "Flanş", questions: [] }],
    });
    render(<TeklifVerPage />);
    expect(
      screen.getByRole("button", { name: "Çelik Boru kalemine teklif vermiyorum" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Flanş kalemine teklif vermiyorum" }),
    ).toBeInTheDocument();
  });

  it("D-122: bulunamayan talepte düğme açık taleplere gider ve öyle adlanır", () => {
    h.detail = undefined;
    render(<TeklifVerPage />);
    expect(screen.getByRole("link", { name: "Açık taleplere dön" })).toHaveAttribute(
      "href",
      "/company/satis",
    );
  });

  it("D-024: 404 → nötr 'ulaşılamıyor' kartı, 'bulunamadı'/Tekrar dene yok; buy:view yoksa kendi firma notu", () => {
    h.detail = undefined;
    h.error = { response: { status: 404 } };
    try {
      render(<TeklifVerPage />);
      expect(screen.getByRole("heading", { name: "Talebe ulaşılamıyor." })).toBeInTheDocument();
      expect(screen.queryByText(/bulunamadı/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
      expect(screen.getByText(/Talep kendi firmanıza aitse/)).toBeInTheDocument();
    } finally {
      h.error = null;
    }
  });

  it("D-024: buy:view yetkili kullanıcıya kendi firma notu gösterilmez", () => {
    h.detail = undefined;
    h.error = { response: { status: 404 } };
    useCompanyAuthStore.setState({ user: { permissions: ["buy:view", "sell:bid"], roles: [], isOwner: false } } as never);
    try {
      render(<TeklifVerPage />);
      expect(screen.getByRole("heading", { name: "Talebe ulaşılamıyor." })).toBeInTheDocument();
      expect(screen.queryByText(/Talep kendi firmanıza aitse/)).toBeNull();
    } finally {
      h.error = null;
      useCompanyAuthStore.setState({ user: null } as never);
    }
  });

  it("D-024: sunucu/ağ hatası → 'Talep yüklenemedi.' + Tekrar dene yeniden çeker", async () => {
    const user = userEvent.setup();
    h.detail = undefined;
    h.error = { response: { status: 500 } };
    try {
      render(<TeklifVerPage />);
      expect(screen.getByRole("heading", { name: "Talep yüklenemedi." })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
      expect(h.refetch).toHaveBeenCalledTimes(1);
    } finally {
      h.error = null;
    }
  });

  it("D-280: gönderilmiş teklif ekranında alıcıya mesaj yolu var", () => {
    h.detail = baseDetail({
      ownerCompanyId: "c-buyer",
      myBid: { amount: "1000", status: "SUBMITTED", version: 2, note: null },
    });
    render(<TeklifVerPage />);
    expect(screen.getByRole("link", { name: "Alıcıya mesaj gönder" })).toHaveAttribute(
      "href",
      "/company/mesajlar?with=c-buyer&portal=satis",
    );
  });

  describe("pazarlık çalışma masası", () => {
    const auction = () =>
      baseDetail({
        english: { isEnglishAuction: true, currentBest: null, bidCount: 0, currentRound: 1 },
      } as Partial<ListingDetail>);

    it("Y-10: birim fiyat Türkçe biçimle okunur ('1.500' = bin beş yüz)", async () => {
      const user = userEvent.setup();
      h.detail = auction();
      render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "1.500");
      // 1.500 × 10 = 15.000,00 ₺ (eskiden 1,5 okunup 15 ₺ oluyordu).
      expect(screen.getAllByText(/15\.000,00 ₺/).length).toBeGreaterThanOrEqual(1);
    });

    it("'Önceki' sütunu girişle aynı biçim: 1.500,50 (arayüz testi kapanış S-SELL NEW-1)", () => {
      // Intl en çok-2 kuralıyla "1.500,5" basıyordu; yanındaki giriş "1.500,50".
      h.detail = baseDetail({
        english: { isEnglishAuction: true, currentBest: null, bidCount: 1, currentRound: 2 },
        myBid: {
          amount: "15005",
          status: "SUBMITTED",
          version: 1,
          note: null,
          items: [{ itemId: "i1", unitPrice: "1500.5" }],
        },
      } as Partial<ListingDetail>);
      render(<TeklifVerPage />);
      expect(screen.getByLabelText("Çelik Boru birim fiyat")).toHaveValue("1.500,50");
      expect(screen.getByText("1.500,50")).toBeInTheDocument();
      expect(screen.queryByText("1.500,5")).toBeNull();
    });

    it("D-273: X kalemi kapsam dışı bırakır (Hariç), 'Teklif ver' geri ekler", async () => {
      const user = userEvent.setup();
      h.detail = auction();
      render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
      await user.click(screen.getByRole("button", { name: "Bu kaleme teklif verme" }));
      expect(screen.queryByLabelText("Çelik Boru birim fiyat")).toBeNull();
      expect(screen.getByText("Hariç")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Teklif ver" }));
      expect(screen.getByLabelText("Çelik Boru birim fiyat")).toBeInTheDocument();
      // Seçim süzgeci "Hariç" değil "Seçim dışı".
      expect(screen.getByRole("button", { name: "Seçim dışı" })).toBeInTheDocument();
    });
  });
});

describe("TeklifVerPage — özet kartı para birimleri (arayüz testi son tur S-BUY)", () => {
  it("çok birimli talepte kart kabul edilen birimlerin tamamını gösterir (yalnız 'TRY' değil)", () => {
    h.detail = baseDetail({ allowedCurrencies: ["TRY", "USD", "EUR"] });
    render(<TeklifVerPage />);
    const dt = screen.getByText("Para Birimleri", { selector: "dt" });
    expect(dt.nextElementSibling).toHaveTextContent("TRY, USD, EUR");
  });

  it("tek birimli talepte 'Para Birimi: TRY' ve alıcı notu kalır", () => {
    render(<TeklifVerPage />);
    const dt = screen.getByText("Para Birimi", { selector: "dt" });
    expect(dt.nextElementSibling).toHaveTextContent("TRY");
  });
});

describe("TeklifVerPage — arayüz testi son tur S-SELL", () => {
  /** Kapalı zarftan pazarlığa taşınan karma birimli teklif (kalem 2 USD). */
  function mixedAuctionDetail(): ListingDetail {
    return baseDetail({
      allowedCurrencies: ["TRY", "USD", "EUR"],
      english: { isEnglishAuction: true },
      items: [
        { id: "i1", lineNo: 1, name: "Cıvata", description: null, quantity: "1000", unit: "adet", targetPrice: null, questions: [] },
        { id: "i2", lineNo: 2, name: "Somun", description: null, quantity: "500", unit: "adet", targetPrice: null, questions: [] },
      ],
      myBid: {
        amount: "1467705.03",
        currency: "TRY",
        status: "SUBMITTED",
        version: 2,
        note: null,
        deliveryTime: "W1_2",
        items: [
          { itemId: "i1", unitPrice: "1400.25", currency: null },
          { itemId: "i2", unitPrice: "2.75", currency: "USD", fxToBase: "49.123456789012" },
        ],
      },
      nextBidConstraint: {
        currencyLocked: true,
        ownCurrency: "TRY",
        ownLastTotal: "1467705.03",
        canBidThisRound: true,
      },
    } as unknown as Partial<ListingDetail>);
  }

  it("pazarlıkta USD kalem damgayla ₺'ye çevrilir: masada ₺ fiyat, not görünür, gönderim kalem birimi taşımaz", async () => {
    const user = userEvent.setup();
    h.detail = mixedAuctionDetail();
    h.mutateAsync.mockResolvedValue({ status: "SUBMITTED" });
    render(<TeklifVerPage />);

    // 2,75 $ × 49,1234… = 135,0895… → yukarı 135,09 ₺ (ham "2,75" DEĞİL).
    const somun = screen.getByLabelText("Somun birim fiyat");
    expect(somun).toHaveValue("135,09");
    expect(screen.getByText(/karşılığına çevrildi/)).toBeInTheDocument();
    // Fiyat değişmeden sahte "indirim" yok: 1.400.250 + 67.545 = 1.467.795 ≥ 1.467.705,03.
    expect(screen.queryByText(/İndirim:/)).toBeNull();

    // Somun'u 130 ₺'ye indir → gönderilebilir.
    await user.clear(somun);
    await user.type(somun, "130");
    await user.click(screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!);
    await user.click(await screen.findByRole("button", { name: "Teklifi Gönder" }));

    const payload = h.mutateAsync.mock.calls[0]![0] as {
      items: { itemId: string; unitPrice: number; currency?: string }[];
    };
    expect(payload.items).toEqual([
      expect.objectContaining({ itemId: "i1", unitPrice: 1400.25 }),
      expect.objectContaining({ itemId: "i2", unitPrice: 130 }),
    ]);
    expect(payload.items.every((it) => it.currency === undefined)).toBe(true);
  });

  it("eleme sonrası yeniden teklifte fiyat iki ondalıkla gelir (1.500,50 — '1.500,5' değil)", () => {
    h.detail = baseDetail({
      myBid: {
        amount: "15005",
        status: "LOST",
        version: 1,
        note: null,
        items: [{ itemId: "i1", unitPrice: "1500.5" }],
      },
    } as Partial<ListingDetail>);
    render(<TeklifVerPage />);
    expect(screen.getByLabelText("Çelik Boru birim fiyat")).toHaveValue("1.500,50");
  });

  it("'Teklif Gönder'e çift tık onay penceresini açık bırakır", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(screen.getByLabelText("Genel teslim süresi"), "W1_2");
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
    const submit = screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!;
    // Koruma penceresi (`CONFIRM_CLOSE_GUARD_MS`) `Date.now()` ile ölçülür. Saat
    // GERÇEK bırakılırsa test makinenin hızına bağlanır: yük altında pencerenin
    // bulunması + tuş vuruşu 500 ms'yi aşıyor, ilk Escape pencereyi kapatıyordu
    // (tam kapıda iki kez, tek başına koşuda beşte bir kırmızı — 2026-10-09).
    // Saat sabitlenir; "hemen sonra" ve "biraz sonra" açıkça verilir.
    const openedAt = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(openedAt);
    try {
      await user.click(submit);
      expect(await screen.findByRole("button", { name: "Teklifi Gönder" })).toBeInTheDocument();
      // Çift tıkın ikinci tıkı pencerenin perdesine düşer → Headless onClose.
      // Aynı kapatma yolu Escape'le tetiklenir: açılıştan hemen sonra YOK
      // sayılmalı (pencere açık kalır), biraz sonra yine kapatabilmeli.
      now.mockReturnValue(openedAt + 100);
      await user.keyboard("{Escape}");
      // Kapanış geçişi (100 ms) bitecek kadar bekle — pencere hâlâ açık olmalı.
      await new Promise((r) => setTimeout(r, 300));
      expect(screen.getByRole("button", { name: "Teklifi Gönder" })).toBeInTheDocument();
      now.mockReturnValue(openedAt + 5_000);
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Teklifi Gönder" })).toBeNull(),
      );
    } finally {
      now.mockRestore();
    }
  });
});

describe("TeklifVerPage — yanıt beklenirken (canlı doğrulama 2026-10-09 taraması)", () => {
  it("çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) 'Talebe ulaşılamıyor' değil 'Yükleniyor…'", () => {
    // Bekleme `isLoading`e bağlıyken (duraklamada false) "ulaşılamıyor —
    // kaldırılmış olabilir" kartı çiziliyordu.
    h.detail = undefined;
    h.paused = true;
    render(<TeklifVerPage />);
    expect(screen.queryByRole("heading", { name: "Talebe ulaşılamıyor." })).toBeNull();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });
});

describe("TeklifVerPage — mobil denetim 2026-10 g08", () => {
  /** Dokunmatik cihaz (birincil işaretçi kaba) sahtesi; testten sonra geri alınır. */
  function withCoarsePointer(): () => void {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    return () => {
      window.matchMedia = original;
    };
  }

  const stickyBar = () => document.querySelector<HTMLElement>("[data-sticky-cta]")!;

  /** Taslak deposu kullanıcı + firma kimliğine bağlı — oturum açık kullanıcı. */
  function withSignedInUser(): () => void {
    const prev = useCompanyAuthStore.getState();
    useCompanyAuthStore.setState({
      user: { id: "u1", permissions: ["sell:view", "sell:bid:submit"], roles: [], isOwner: true },
      company: { id: "c1" },
    } as never);
    return () => useCompanyAuthStore.setState({ user: prev.user, company: prev.company } as never);
  }

  it("yapışkan çubuk data-sticky-cta taşır; toplam sütunu esner, düğme en çok yarı genişlik ve telefonda sarabilir (RU taşması)", () => {
    render(<TeklifVerPage />);
    const bar = stickyBar();
    expect(bar).not.toBeNull();
    expect(bar.className.split(" ")).toEqual(expect.arrayContaining(["fixed", "inset-x-0", "bottom-0", "mb-0", "flex"]));
    expect((bar.firstElementChild as HTMLElement).className.split(" ")).toEqual(
      expect.arrayContaining(["min-w-0", "flex-1"]),
    );
    const btn = within(bar).getByRole("button", { name: "Teklif Gönder" });
    const classes = btn.className.split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "max-w-[50%]",
        "whitespace-normal",
        "sm:whitespace-nowrap",
        // Sıkı satır yüksekliğinde tek satırlık etiket yine 44 px kalsın.
        "leading-tight",
        "max-sm:py-[calc(--spacing(3)-1px)]",
      ]),
    );
    expect(classes).not.toContain("whitespace-nowrap");
  });

  it("eksik varken yapışkan 'Teklif Gönder' pasif değil: basınca eksik listesi odaklanır, onay penceresi açılmaz; masaüstü düğmesi pasif kalır", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    const desktop = screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!;
    const sticky = within(stickyBar()).getByRole("button", { name: "Teklif Gönder" });
    expect(desktop).toBeDisabled();
    expect(sticky).toBeEnabled();
    // Pasif GÖRÜNÜR ama tıklanır (Headless UI `aria-disabled`de işleyiciyi söker).
    expect(sticky).toHaveAttribute("data-incomplete");
    expect(sticky).not.toHaveAttribute("aria-disabled");
    const list = screen.getByText(/En az bir kaleme birim fiyat girin/).closest("ul")!;
    expect(sticky).toHaveAttribute("aria-describedby", list.id);

    await user.click(sticky);
    expect(list).toHaveFocus();
    expect(list.className).toContain("border-amber-300");
    expect(screen.queryByRole("button", { name: "Teklifi Gönder" })).toBeNull();
  });

  it("eksik kalmayınca yapışkan 'Teklif Gönder' onay penceresini açar", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
    await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
    await user.selectOptions(screen.getByLabelText("Genel teslim süresi"), "W1_2");
    const sticky = within(stickyBar()).getByRole("button", { name: "Teklif Gönder" });
    expect(sticky).not.toHaveAttribute("data-incomplete");
    await user.click(sticky);
    expect(await screen.findByRole("button", { name: "Teklifi Gönder" })).toBeInTheDocument();
  });

  it("dokunmatik cihazda metin alanı odaktayken (ekran klavyesi) yapışkan çubuk gizlenir, odak çıkınca geri gelir", async () => {
    const restore = withCoarsePointer();
    try {
      render(<TeklifVerPage />);
      expect(stickyBar().className).toContain("flex");
      const price = screen.getByLabelText("Çelik Boru birim fiyat");
      act(() => price.focus());
      await waitFor(() => expect(stickyBar().className.split(" ")).toContain("hidden"));
      // Seçim kutusu klavye açmaz → çubuk geri gelir.
      act(() => screen.getByLabelText("Genel teslim süresi").focus());
      await waitFor(() => expect(stickyBar().className.split(" ")).toContain("flex"));
    } finally {
      restore();
    }
  });

  it("fareli cihazda alan odakta olsa da yapışkan çubuk yerinde kalır", async () => {
    render(<TeklifVerPage />);
    act(() => screen.getByLabelText("Çelik Boru birim fiyat").focus());
    await new Promise((r) => setTimeout(r, 0));
    expect(stickyBar().className.split(" ")).not.toContain("hidden");
  });

  it("kalem 'teklif vermiyorum' düğmesinin metni telefonda da görünür (yalnız × değil)", () => {
    render(<TeklifVerPage />);
    const btn = screen.getByRole("button", { name: "Çelik Boru kalemine teklif vermiyorum" });
    expect(btn).toHaveTextContent("Bu kaleme teklif vermiyorum");
    expect(btn.querySelector(".sr-only")).toBeNull();
    expect(btn.className.split(" ")).toEqual(expect.arrayContaining(["min-h-11", "-mx-2", "px-2", "text-left"]));
  });

  // Mobil denetim 2026-10 (1024 + sabit kenar çubuğu): sol sütun 443 px; ekran
  // genişliğine (`sm:`) bağlı yan yana dizilimde 144 px fiyat + "teklif
  // vermiyorum" (RU 289 px) kalem adına 69 px bırakıyor, ad 7 satıra
  // kırılıyordu. Kart KENDİ genişliğine göre dizilir; düğme her genişlikte
  // fiyatın altında, 144 px'lik sütunun içinde sarar.
  it("kalem kartı kendi genişliğine göre dizilir (@container): ad solda, fiyat sütunu 144 px, 'teklif vermiyorum' fiyatın altında sarar", () => {
    render(<TeklifVerPage />);
    const btn = screen.getByRole("button", { name: "Çelik Boru kalemine teklif vermiyorum" });
    const priceCol = btn.parentElement as HTMLElement;
    expect(priceCol.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "flex-col", "items-start", "@sm:w-36", "@sm:shrink-0"]),
    );
    // Fiyat ve düğme aynı sütunda, alt alta (yan yana dizilim yok).
    expect(priceCol.className).not.toMatch(/(^|\s)(@?\w*:)?flex-row(\s|$)/);
    expect(within(priceCol).getByLabelText("Çelik Boru birim fiyat")).toBeInTheDocument();
    const row = priceCol.parentElement as HTMLElement;
    expect(row.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "flex-col", "@sm:flex-row", "@sm:items-start"]),
    );
    expect(row.className).not.toMatch(/(^|\s)sm:flex-row(\s|$)/);
    const card = row.parentElement as HTMLElement;
    expect(card.className.split(" ")).toContain("@container");
    // Ad sütunu esner, taban 0 (fiyat sütunu onu sıkıştırmaz, taşırmaz).
    expect((row.firstElementChild as HTMLElement).className.split(" ")).toEqual(
      expect.arrayContaining(["min-w-0", "flex-1"]),
    );
    // Düğme metni sarabilir: ekran genişliğine bağlı hizalama/boyut kalmadı.
    const cls = btn.className.split(" ");
    expect(cls).not.toContain("shrink-0");
    expect(cls.filter((c) => /^sm:/.test(c))).toEqual([]);
    expect(btn.querySelector("svg")?.getAttribute("class")).toMatch(/(^|\s)shrink-0(\s|$)/);
  });

  // Mobil denetim v4new2: kalem ek alanları ekran kırılımıyla (`sm:`) iki
  // sütundu — 1024 + sabit kenar çubuğunda 463 px'lik kartta seçimler 208 px'e
  // iniyor, RU "Действует общий срок" sözcük ortasından kesiliyordu. Izgara
  // kendi kabının (`@container`) genişliğine bakar: iki sütun ≥ 32 rem.
  it("kalem ek alanları kendi kabının genişliğine göre dizilir (@container, @lg:grid-cols-2)", () => {
    h.detail = baseDetail({ allowedCurrencies: ["TRY", "EUR"] });
    render(<TeklifVerPage />);
    const delivery = screen.getByLabelText("Çelik Boru teslim süresi");
    const grid = delivery.closest(".grid") as HTMLElement;
    expect(grid).toBe(screen.getByLabelText("Çelik Boru para birimi").closest(".grid"));
    expect(grid.className.split(" ")).toEqual(expect.arrayContaining(["grid-cols-1", "@lg:grid-cols-2"]));
    expect(grid.className).not.toMatch(/(^|\s)sm:/);
    expect((grid.parentElement as HTMLElement).className.split(" ")).toContain("@container");
    // Muadil satırı iki sütunu kaplar — aynı kap kırılımıyla (tek sütunda
    // `col-span-2` örtük ikinci sütun açardı).
    const altField = screen.getByLabelText(/^Muadil \(eşdeğer\) ürün teklif ediyorum/).closest("label")!.parentElement as HTMLElement;
    expect(altField.parentElement).toBe(grid);
    expect(altField.className).toMatch(/(^|\s)@lg:col-span-2(\s|$)/);
    expect(altField.className).not.toMatch(/(^|\s)sm:col-span/);
  });

  // Mobil denetim 2026-10: 1024 + kenar çubuğunda sağ kolon 221 px — 24 px'lik
  // "1.800.000.000,00 ₺" kartı ve sayfayı taşırıyordu (scrollWidth 1028). Tutar
  // bölünmez; yazı boyu kutuya göre küçülür (`fit-total.ts`).
  it("toplam kutuları @container; tutar bölünmeyen parça olarak kalır", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
    const label = screen.getAllByText("Toplam Teklif").find((p) => p.closest(".bg-emerald-700"))!;
    const card = label.closest(".bg-emerald-700") as HTMLElement;
    expect(card.className.split(" ")).toContain("@container");
    const amount = label.nextElementSibling as HTMLElement;
    expect(amount.className.split(" ")).toEqual(expect.arrayContaining(["text-2xl", "tabular-nums"]));
    for (const part of amount.querySelectorAll("span")) {
      expect(part.className.split(" ")).toContain("whitespace-nowrap");
    }
    expect(amount.className).not.toMatch(/(^|\s)(break-all|wrap-anywhere|break-words)(\s|$)/);
    // Mobil alt çubuğun toplam sütunu da kapsayıcı.
    const barTotal = within(stickyBar()).getByText("Toplam Teklif").parentElement as HTMLElement;
    expect(barTotal.className.split(" ")).toEqual(expect.arrayContaining(["@container", "min-w-0", "flex-1"]));
  });

  it("muadil onay kutusu iki satırlık etikette ezilmez (shrink-0)", () => {
    render(<TeklifVerPage />);
    const box = screen.getByRole("checkbox", { name: /muadil/i });
    expect(box.className.split(" ")).toContain("shrink-0");
  });

  it("seçilen dosya satırı: tür seçici telefonda ayrı satırda, ad iki satıra kadar okunur", async () => {
    const user = userEvent.setup();
    render(<TeklifVerPage />);
    const name = "MOBIL-QA-teklif-mektubu-ornek-uzun-dosya-adi-2026.pdf";
    await user.upload(
      screen.getByLabelText("Teklif dosyası seç"),
      new File(["%PDF-1.4"], name, { type: "application/pdf" }),
    );
    const nameEl = screen.getByText(name);
    expect(nameEl).toHaveAttribute("title", name);
    expect(nameEl.className.split(" ")).toEqual(expect.arrayContaining(["line-clamp-2", "break-all"]));
    const row = nameEl.closest("li")!;
    expect(row.className.split(" ")).toEqual(expect.arrayContaining(["flex-wrap", "sm:flex-nowrap"]));
    // Tür seçicinin (SelectMenu) kökü, adlandırılmış düğmesinin ebeveyni.
    const selectRoot = within(row).getByRole("button", { name: `${name} kategorisi` })
      .parentElement as HTMLElement;
    expect(selectRoot.className.split(" ")).toEqual(
      expect.arrayContaining(["order-last", "w-full", "sm:order-none", "sm:w-40"]),
    );
  });

  it("Vazgeç: fiyat yazılmışsa sormadan gitmez; 'Ayrıl' denince talebe döner ve saklanan taslak silinir", async () => {
    const restore = withSignedInUser();
    try {
      const user = userEvent.setup();
      render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
      await waitFor(() =>
        expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).toContain("150"),
      );
      await user.click(screen.getByRole("link", { name: "Vazgeç" }));
      await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
      expect(h.confirm.mock.calls[0]![0]).toMatchObject({ title: "Kaydedilmemiş değişiklikler kaybolsun mu?" });
      await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/l1"));
      expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).toBeNull();
    } finally {
      restore();
    }
  });

  it("Vazgeç diyaloğunda 'Formda kal' → sayfada kalınır, fiyat ve taslak durur", async () => {
    const restore = withSignedInUser();
    h.confirm.mockResolvedValueOnce(false);
    try {
      const user = userEvent.setup();
      render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
      await user.click(screen.getByRole("link", { name: "Vazgeç" }));
      await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
      expect(h.push).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).toContain("150");
    } finally {
      restore();
    }
  });

  it("geri hareketiyle çıkılan form yeniden açılınca fiyatlar geri yüklenir; 'Değişiklikleri at' sunucu hâline döndürür", async () => {
    const restore = withSignedInUser();
    try {
      const user = userEvent.setup();
      const first = render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
      await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
      await waitFor(() =>
        expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).toContain("Türkiye"),
      );
      // Geri hareketi: soru sorulmadan sayfa kapanır.
      first.unmount();
      expect(h.confirm).not.toHaveBeenCalled();

      render(<TeklifVerPage />);
      expect(
        await screen.findByText("Kaydetmediğiniz teklif bilgileri geri yüklendi."),
      ).toBeInTheDocument();
      expect(screen.getByText("Fiyatlandırılan kalem 1/1")).toBeInTheDocument();
      expect(screen.getByLabelText(/Menşei ülke/)).toHaveValue("Türkiye");

      await user.click(screen.getByRole("button", { name: "Değişiklikleri at" }));
      await waitFor(() => expect(screen.getByText("Fiyatlandırılan kalem 0/1")).toBeInTheDocument());
      expect(screen.queryByText("Kaydetmediğiniz teklif bilgileri geri yüklendi.")).toBeNull();
      expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).toBeNull();
    } finally {
      restore();
    }
  });

  it("taslak saklıyken talep kapandıysa (kapı ekranı, form yok) bağlantı kaydedilmemiş değişiklik sormaz", async () => {
    const restore = withSignedInUser();
    try {
      const user = userEvent.setup();
      const first = render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
      await waitFor(() => expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).not.toBeNull());
      first.unmount();

      // Teklif aynı (taban değişmedi) ama talep kapandı → form yerine kapı ekranı.
      h.detail = baseDetail({ status: "CLOSED" });
      render(<TeklifVerPage />);
      await screen.findByText("Bu alım talebine artık teklif verilemez");
      // jsdom belge gezinmesini desteklemez: koruma (yakalama aşaması) sormazsa
      // tıklama buraya ulaşır, gezinme burada durdurulur.
      const stopNavigation = (e: MouseEvent) => e.preventDefault();
      document.addEventListener("click", stopNavigation);
      try {
        await user.click(screen.getByRole("link", { name: "Alım Talebi Detayına Dön" }));
      } finally {
        document.removeEventListener("click", stopNavigation);
      }
      expect(h.confirm).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("sunucudaki teklif değiştiyse (ör. taslak kaydedildi) eski oturum taslağı geri yüklenmez", async () => {
    const restore = withSignedInUser();
    try {
      const user = userEvent.setup();
      const first = render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
      await waitFor(() => expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).not.toBeNull());
      first.unmount();

      h.detail = baseDetail({
        myBid: {
          amount: "900",
          status: "DRAFT",
          version: 2,
          note: null,
          items: [{ itemId: "i1", unitPrice: "90" }],
        },
      } as Partial<ListingDetail>);
      render(<TeklifVerPage />);
      await screen.findByText("Fiyatlandırılan kalem 1/1");
      expect(screen.queryByText("Kaydetmediğiniz teklif bilgileri geri yüklendi.")).toBeNull();
      expect(screen.getAllByText(/900/).length).toBeGreaterThan(0);
      expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).toBeNull();
    } finally {
      restore();
    }
  });

  it("başarılı gönderim saklanan taslağı siler", async () => {
    const restore = withSignedInUser();
    h.mutateAsync.mockResolvedValue({ status: "SUBMITTED" });
    try {
      const user = userEvent.setup();
      render(<TeklifVerPage />);
      await user.type(screen.getByLabelText("Çelik Boru birim fiyat"), "150");
      await user.type(screen.getByLabelText(/Menşei ülke/), "Türkiye");
      await user.selectOptions(screen.getByLabelText("Genel teslim süresi"), "W1_2");
      await waitFor(() => expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).not.toBeNull());
      await user.click(screen.getAllByRole("button", { name: "Teklif Gönder" })[0]!);
      await user.click(await screen.findByRole("button", { name: "Teklifi Gönder" }));
      await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/l1"));
      expect(sessionStorage.getItem("rothern:bid-form-draft:u1:l1")).toBeNull();
    } finally {
      restore();
    }
  });
});
