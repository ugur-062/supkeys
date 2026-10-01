// @vitest-environment jsdom
import type {
  CompanyOrderDetail,
  CompanyOrderStatus,
} from "@/hooks/use-company-orders";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  order: undefined as CompanyOrderDetail | undefined,
  isLoading: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  mutate: vi.fn(),
  confirm: vi.fn(async () => true),
}));

const authRoles = vi.hoisted(() => ({
  current: ["SATIN_ALMACI", "SATISCI"] as string[],
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "o1" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/realtime", () => ({
  subscribeRealtime: () => () => {},
}));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("@/hooks/use-company-bank-accounts", () => ({
  useBankAccounts: () => ({ data: [] }),
}));
// F7: aksiyonlar rol-kapılı (canActOnOrder) — varsayılan tam-rollü kurucu
// paritesi; persona testi rolleri daraltır.
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { roles: authRoles.current } }),
}));

// Ağır alt bileşenleri sadeleştir — durum makinesi/aksiyon UI'sine odaklan.
vi.mock("@/components/orders/order-payments-card", () => ({
  OrderPaymentsCard: () => null,
}));
vi.mock("../_components/order-timeline", () => ({
  OrderTimeline: () => null,
}));
vi.mock("../_components/order-review-card", () => ({
  OrderReviewCard: () => null,
}));

// mut factory'nin İÇİNDE tanımlanmalı — vi.mock dosya başına hoist edilir,
// dışarıdaki `const mut`'a erişim "Cannot access before initialization" verir.
vi.mock("@/hooks/use-company-orders", () => {
  const mut = () => ({ mutateAsync: h.mutate, isPending: false });
  return {
    useOrder: () => ({
      data: h.order,
      isLoading: h.isLoading,
      isError: h.isError,
      error: h.error,
      refetch: h.refetch,
    }),
    useShipOrder: mut,
    useReceiveOrder: mut,
    useCompleteOrder: mut,
    useAcceptOrder: mut,
    useRejectOrder: mut,
    useCancelOrder: mut,
    useRequestCancel: mut,
    useWithdrawCancelRequest: mut,
    useCancelRequestDecision: mut,
    useRaiseDefectNotice: mut,
    useWithdrawDefectNotice: mut,
    useLcStep: mut,
  };
});

import OrderDetailPage from "../page";

function order(
  status: CompanyOrderStatus,
  role: "buyer" | "seller",
  over: Partial<CompanyOrderDetail> = {},
): CompanyOrderDetail {
  return {
    id: "o1",
    number: "ORD-2026-0001",
    amount: "1000",
    currency: "TRY",
    status,
    role,
    counterparty: "Karşı A.Ş.",
    counterpartyCompanyId: "c1",
    listingId: "l1",
    listingTitle: "Çelik Alımı",
    listingType: "ALIM",
    listingNumber: "ROT-2026-0001",
    createdAt: new Date().toISOString(),
    counterpartyProfile: {
      city: null,
      industry: null,
      email: null,
      phone: null,
      rothernId: null,
    },
    paymentTiming: "AFTER_DELIVERY",
    requireGuaranteeLetter: false,
    paymentOpen: false,
    paymentTotals: { confirmed: "0", pending: "0", remaining: "1000" },
    payments: [],
    items: [],
    deliveryAddress: null,
    paymentCategory: "OPEN_ACCOUNT",
    advancePercent: null,
    paymentDays: null,
    lcType: null,
    lcConfirmed: false,
    paymentNote: null,
    deliveryTerm: null,
    acceptedAt: null,
    acceptedNote: null,
    bankAccountHolder: null,
    bankIban: null,
    expectedDeliveryDate: null,
    invoiceNumber: null,
    deliveryStartedAt: null,
    deliveryNote: null,
    deliveredAt: null,
    completedAt: null,
    completedNote: null,
    rejectedAt: null,
    rejectedReason: null,
    cancelledAt: null,
    cancelReason: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order = undefined;
  h.isLoading = false;
  h.isError = false;
  h.error = null;
  h.confirm.mockResolvedValue(true);
  authRoles.current = ["SATIN_ALMACI", "SATISCI"];
});

describe("OrderDetailPage — yükleme/bulunamadı", () => {
  it("yükleniyorken iskelet (aria-hidden) gösterir", () => {
    h.isLoading = true;
    const { container } = render(<OrderDetailPage />);
    expect(container.querySelector('[aria-hidden]')).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("veri yoksa 'Sipariş bulunamadı.'", () => {
    h.order = undefined;
    h.isLoading = false;
    render(<OrderDetailPage />);
    expect(screen.getByText("Sipariş bulunamadı.")).toBeInTheDocument();
  });

  it("404 → 'Sipariş bulunamadı.' (yeniden deneme yok)", () => {
    h.isError = true;
    h.error = { response: { status: 404 } };
    render(<OrderDetailPage />);
    expect(screen.getByText("Sipariş bulunamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).not.toBeInTheDocument();
  });

  it("O-092: 500/ağ hatası → hata durumu + 'Tekrar dene' (bulunamadı DEĞİL)", async () => {
    h.isError = true;
    h.error = { response: { status: 500 } };
    render(<OrderDetailPage />);
    expect(screen.queryByText("Sipariş bulunamadı.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.refetch).toHaveBeenCalled();
  });
});

describe("OrderDetailPage — durum → aksiyon eşlemesi", () => {
  it("PENDING + satıcı → Kabul Et / Reddet", () => {
    h.order = order("PENDING", "seller");
    render(<OrderDetailPage />);
    expect(screen.getByRole("button", { name: "Kabul Et" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reddet" })).toBeInTheDocument();
  });

  it("PENDING + alıcı → onay bekleme metni + İptal Et", () => {
    h.order = order("PENDING", "buyer");
    render(<OrderDetailPage />);
    expect(
      screen.getByText(/Satıcının siparişi onaylaması bekleniyor/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Siparişi İptal Et" }),
    ).toBeInTheDocument();
  });

  it("ACCEPTED + satıcı → Siparişi Tamamla (madde 17: gönder yerine tamamla)", () => {
    h.order = order("ACCEPTED", "seller");
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    ).toBeInTheDocument();
  });

  it("ACCEPTED + satıcı + alıcı-toplar teslim (EXW) → yine Siparişi Tamamla", () => {
    h.order = order("ACCEPTED", "seller", { deliveryTerm: "EXW" });
    render(<OrderDetailPage />);
    expect(
      screen.getAllByRole("button", { name: "Siparişi Tamamla" })[0],
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Siparişi Gönder (eski)" }),
    ).not.toBeInTheDocument();
  });

  it("IN_DELIVERY + alıcı → Teslim Aldım", () => {
    h.order = order("IN_DELIVERY", "buyer");
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Teslim Aldım" }),
    ).toBeInTheDocument();
  });

  it("DELIVERED + alıcı + TAM ödeme onaylı → Siparişi Tamamla", () => {
    h.order = order("DELIVERED", "buyer", {
      paymentTotals: { confirmed: "1000", pending: "0", remaining: "0" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    ).toBeInTheDocument();
  });

  it("DELIVERED + alıcı + ödeme eksik → Tamamla VAR (yaşam döngüsü ayrımı: kabul ödemeden bağımsız)", () => {
    h.order = order("DELIVERED", "buyer", {
      paymentTotals: { confirmed: "0", pending: "0", remaining: "1000" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    ).toBeInTheDocument();
  });

  it("DELIVERED + alıcı + bekleyen ödeme → Tamamla yine VAR (ödeme sipariş kabulünü engellemez)", () => {
    h.order = order("DELIVERED", "buyer", {
      paymentTotals: { confirmed: "0", pending: "1000", remaining: "0" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    ).toBeInTheDocument();
  });

  it("ACCEPTED + satıcı + bekleyen ödeme → gönderim YOK, ödeme onayı uyarısı", () => {
    h.order = order("ACCEPTED", "seller", {
      paymentTotals: { confirmed: "0", pending: "1000", remaining: "0" },
    });
    render(<OrderDetailPage />);
    expect(
      screen.queryByRole("button", { name: "Siparişi Gönder (eski)" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Alıcı ödeme bildirdi/)).toBeInTheDocument();
  });

  it("COMPLETED → tamamlandı mesajı, aksiyon yok", () => {
    h.order = order("COMPLETED", "buyer");
    render(<OrderDetailPage />);
    expect(screen.getByText(/Sipariş tamamlandı/)).toBeInTheDocument();
  });

  it("PENDING + teminat şartlı ilan, satıcı → teminat mektubu uyarısı", () => {
    h.order = order("PENDING", "seller", {
      paymentTiming: "BEFORE_DELIVERY",
      requireGuaranteeLetter: true,
    });
    render(<OrderDetailPage />);
    expect(screen.getByText(/teminat mektubu şartı/)).toBeInTheDocument();
  });

  it("PENDING + teslim öncesi ödeme ama teminat şartsız → uyarı yok (opsiyonel özellik)", () => {
    h.order = order("PENDING", "seller", {
      paymentTiming: "BEFORE_DELIVERY",
      requireGuaranteeLetter: false,
    });
    render(<OrderDetailPage />);
    expect(screen.queryByText(/teminat mektubu şartı/)).not.toBeInTheDocument();
  });

  it("'Kabul Et' → AcceptOrderModal açılır (Siparişi Onayla)", async () => {
    h.order = order("PENDING", "seller");
    render(<OrderDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Kabul Et" }));
    expect(
      await screen.findByText("Siparişi Onayla"),
    ).toBeInTheDocument();
  });
});


describe("OrderDetailPage — F7 rol kapısı (etiket-only salt-okunur)", () => {
  const PERSONAS: [string, string[]][] = [
    ["salt-SAHIP", ["SAHIP"]],
    ["salt-YONETICI", ["YONETICI"]],
    ["salt-ONAYLAYICI", ["ONAYLAYICI"]],
    ["rolsüz", []],
  ];
  for (const [name, roles] of PERSONAS) {
    it(`${name}: PENDING satıcı görünümünde Kabul/Reddet GİZLİ, sayfa görünür`, () => {
      authRoles.current = roles;
      h.order = order("PENDING", "seller");
      render(<OrderDetailPage />);
      // Sayfa/veri görünür (salt-okunur gözetim regresyonu).
      expect(screen.getByText("Satış siparişi")).toBeInTheDocument();
      // Aksiyonlar gizli, açıklayıcı not var.
      expect(
        screen.queryByRole("button", { name: "Kabul Et" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Reddet" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/rolü gerektirir/)).toBeInTheDocument();
    });
  }

  it("yön uyuşmayan rol: alıcı görünümünde yalnız-Satışçı 'Teslim Aldım' GÖRMEZ", () => {
    authRoles.current = ["SATISCI"];
    h.order = order("IN_DELIVERY", "buyer");
    render(<OrderDetailPage />);
    expect(
      screen.queryByRole("button", { name: "Teslim Aldım" }),
    ).not.toBeInTheDocument();
  });
});

describe("OrderDetailPage — A1-DISPUTED akreditif (derin denetim MU-23)", () => {
  const lc = { paymentCategory: "LETTER_OF_CREDIT" } as Partial<CompanyOrderDetail>;

  it("alıcı: akreditif açılmamışken 'Akreditif Açıldı' görünür", () => {
    h.order = order("DISPUTED", "buyer", { ...lc, defectNotifiedAt: null });
    render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Akreditif Açıldı" }),
    ).toBeInTheDocument();
  });

  it("satıcı: açılmış akreditifi kabul edebilir; kabul sonrası 'Siparişi Tamamla' (sevk çıkışı)", () => {
    h.order = order("DISPUTED", "seller", {
      ...lc,
      defectNotifiedAt: null,
      lcOpenedAt: new Date().toISOString(),
    } as Partial<CompanyOrderDetail>);
    const { unmount } = render(<OrderDetailPage />);
    expect(
      screen.getByRole("button", { name: "Akreditifi Kabul Ettim" }),
    ).toBeInTheDocument();
    unmount();

    h.order = order("DISPUTED", "seller", {
      ...lc,
      defectNotifiedAt: null,
      lcOpenedAt: new Date().toISOString(),
      lcAcceptedAt: new Date().toISOString(),
    } as Partial<CompanyOrderDetail>);
    render(<OrderDetailPage />);
    expect(
      screen.getAllByRole("button", { name: "Siparişi Tamamla" })[0],
    ).toBeInTheDocument();
  });

  it("ayıp ihbarlı DISPUTED: LC açılış/kabul adımı sunulmaz", () => {
    h.order = order("DISPUTED", "buyer", {
      ...lc,
      defectNotifiedAt: new Date().toISOString(),
    });
    render(<OrderDetailPage />);
    expect(
      screen.queryByRole("button", { name: "Akreditif Açıldı" }),
    ).not.toBeInTheDocument();
  });
});

describe("OrderDetailPage — arayüz testi webB-07", () => {
  it("O-055: peşin %100 kabul edilmiş sipariş, alıcı → 'Ödemeyi yapıp bildirin' (karşı taraf DEĞİL)", () => {
    h.order = order("ACCEPTED", "buyer", {
      paymentCategory: "ADVANCE",
      advancePercent: 100,
      advanceDue: "1000.00",
      paymentTiming: "BEFORE_DELIVERY",
      paymentOpen: true,
    });
    render(<OrderDetailPage />);
    expect(screen.getByText(/peşin ödeme şartı var/)).toBeInTheDocument();
    expect(screen.queryByText(/Karşı tarafın işlemi bekleniyor/)).not.toBeInTheDocument();
  });

  it("O-055: peşin bildirimi onay bekliyorsa alıcıya bekleme metni", () => {
    h.order = order("ACCEPTED", "buyer", {
      paymentCategory: "ADVANCE",
      advancePercent: 100,
      advanceDue: "1000.00",
      paymentTotals: { confirmed: "0", pending: "1000", remaining: "0" },
    });
    render(<OrderDetailPage />);
    expect(screen.getByText(/Peşin ödeme bildiriminiz satıcının onayını bekliyor/)).toBeInTheDocument();
  });

  it("O-055: akreditif açılmamış, alıcı → akreditifi açtırıp işaretleme metni", () => {
    h.order = order("ACCEPTED", "buyer", { paymentCategory: "LETTER_OF_CREDIT" });
    render(<OrderDetailPage />);
    expect(screen.getByText(/Akreditifi bankanızdan açtırın/)).toBeInTheDocument();
    expect(screen.queryByText(/Karşı tarafın işlemi bekleniyor/)).not.toBeInTheDocument();
  });

  it("O-055: iptal edilmiş siparişte 'başka adım yok'", () => {
    h.order = order("CANCELLED", "buyer");
    render(<OrderDetailPage />);
    expect(screen.getByText(/Sipariş iptal edildi — başka adım yok/)).toBeInTheDocument();
    expect(screen.queryByText(/Karşı tarafın işlemi bekleniyor/)).not.toBeInTheDocument();
  });

  it("O-030: ayıp ihbarlı DISPUTED (önceki COMPLETED) — biten adımlar işaretli, son adım amber", () => {
    h.order = order("DISPUTED", "buyer", {
      defectNotifiedAt: new Date().toISOString(),
      disputePrevStatus: "COMPLETED",
    } as Partial<CompanyOrderDetail>);
    const { container } = render(<OrderDetailPage />);
    expect(container.querySelectorAll(".bg-emerald-500")).toHaveLength(3);
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.querySelector(".border-amber-500")).not.toBeNull();
  });

  it("O-030: A1-DISPUTED (önceki durum yok) → Onay adımı işaretli kalır", () => {
    h.order = order("DISPUTED", "seller", { defectNotifiedAt: null });
    const { container } = render(<OrderDetailPage />);
    expect(container.querySelectorAll(".bg-emerald-500")).toHaveLength(1);
  });

  it("D-105: açık iptal talebinde 'iptal edilemez' bandı çizilmez", () => {
    h.order = order("ACCEPTED", "buyer", {
      cancelRequestedAt: new Date().toISOString(),
      cancelRequestReason: "Stok tükendi, gönderemiyoruz.",
      paymentTotals: { confirmed: "500", pending: "0", remaining: "500" },
    });
    render(<OrderDetailPage />);
    expect(screen.queryByText(/iptal edilemez/)).not.toBeInTheDocument();
  });

  it("D-105: iptal edilen siparişte özet 'Kalan' gösterilmez", () => {
    h.order = order("CANCELLED", "buyer", {
      paymentTotals: { confirmed: "500", pending: "0", remaining: "500" },
    });
    render(<OrderDetailPage />);
    expect(screen.queryByText("Kalan")).not.toBeInTheDocument();
  });

  it("D-127: onaysız tam bildirimde Kalan onaylıya göre (1.000) + ayrı 'Onay bekleyen' satırı", () => {
    h.order = order("ACCEPTED", "buyer", {
      paymentTotals: { confirmed: "0", pending: "1000", remaining: "0" },
      paymentSettled: false,
    });
    render(<OrderDetailPage />);
    const kalan = screen.getByText("Kalan").nextElementSibling as HTMLElement;
    expect(kalan.textContent).toMatch(/1\.000,00/);
    expect(kalan.querySelector(".text-amber-700")).not.toBeNull();
    expect(screen.getByText("Onay bekleyen")).toBeInTheDocument();
  });

  it("O-029: akreditifli siparişte (eski kayıtta yazılmış) IBAN gösterilmez", () => {
    h.order = order("ACCEPTED", "buyer", {
      paymentCategory: "LETTER_OF_CREDIT",
      bankAccountHolder: "Satıcı A.Ş.",
      bankIban: "TR330006100519786457841326",
    });
    render(<OrderDetailPage />);
    expect(screen.queryByText("IBAN")).not.toBeInTheDocument();
    expect(screen.queryByText("Satıcı A.Ş.")).not.toBeInTheDocument();
  });

  it("O-029: 'Akreditif Açıldı' onay penceresinden geçer; vazgeçilirse istek atılmaz", async () => {
    h.order = order("ACCEPTED", "buyer", { paymentCategory: "LETTER_OF_CREDIT" });
    h.confirm.mockResolvedValueOnce(false);
    render(<OrderDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Akreditif Açıldı" }));
    expect(h.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Akreditif açıldı mı?" }),
    );
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("O-029: 'Ödeme Bankadan Alındı' GERİ ALINAMAZ uyarılı onaydan sonra çalışır", async () => {
    h.order = order("DELIVERED", "seller", {
      paymentCategory: "LETTER_OF_CREDIT",
      lcOpenedAt: new Date().toISOString(),
      lcAcceptedAt: new Date().toISOString(),
    } as Partial<CompanyOrderDetail>);
    render(<OrderDetailPage />);
    await userEvent.click(screen.getByRole("button", { name: "Ödeme Bankadan Alındı" }));
    expect(h.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        destructive: true,
        description: expect.stringMatching(/GERİ ALINAMAZ/),
      }),
    );
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });

  it("D-128: akreditif başlığı sözcüğü tekrar etmez, TR'de 'Sight' yok", () => {
    h.order = order("ACCEPTED", "seller", {
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
    });
    render(<OrderDetailPage />);
    expect(screen.getByText("Akreditif (görüldüğünde ödemeli)")).toBeInTheDocument();
    expect(screen.queryByText(/Sight/)).not.toBeInTheDocument();
  });

  it("O-003: muadil kalemde teklif edilen ve istenen marka/parça no görünür", () => {
    h.order = order("PENDING", "buyer", {
      items: [
        {
          id: "i1",
          name: "Rulman 6204",
          quantity: "200",
          unit: "adet",
          unitPrice: "3.20",
          requestedBrand: "SKF",
          requestedMpn: "6204-2RS",
          isAlternative: true,
          offeredBrand: "FAG",
          offeredMpn: "6204-2Z-C3",
        },
      ],
    });
    render(<OrderDetailPage />);
    expect(screen.getByText("Muadil")).toBeInTheDocument();
    expect(screen.getByText("Teklif edilen: FAG · 6204-2Z-C3")).toBeInTheDocument();
    expect(screen.getByText("İstenen: SKF · 6204-2RS")).toBeInTheDocument();
  });
});
