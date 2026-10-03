// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reviewMutate: vi.fn(),
  push: vi.fn(),
  search: "",
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useReviewDocuments: () => ({ mutate: h.reviewMutate, mutateAsync: (...a: unknown[]) => { (h.reviewMutate as (...x: unknown[]) => unknown)(...a); return Promise.resolve({ status: "VERIFIED" }); }, isPending: false }),
  useReviewDocRevision: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(() => Promise.resolve()), isPending: false }),
}));

import { DocsTab } from "../docs-tab";
import type { AdminCompanyDetail } from "@/hooks/use-admin-companies";

function detail(over: Partial<AdminCompanyDetail> = {}): AdminCompanyDetail {
  return {
    id: "c1",
    pendingRevisions: [],
    rothernId: "SK-001",
    name: "Acme A.Ş.",
    legalName: "Acme Anonim Şirketi",
    taxNumber: "1234567890",
    taxOffice: "Kadıköy",
    country: "TR",
    stateRegion: null,
    city: "İstanbul",
    addressLine: null,
    billingEmail: null,
    tier: "STANDART",
    membershipEndAt: null,
    industry: null,
    website: null,
    companyVerificationStatus: "PENDING",
    companyVerifiedAt: null,
    companyRejectionReason: null,
    mersisNo: "0000000000000000",
    tradeRegistryNo: "123456",
    iban: "TR000000000000000000000000",
    ibanHolder: "Acme A.Ş.",
    docTaxPlateUrl: "https://x/tax",
    docTaxPlateStatus: "PENDING",
    docTaxPlateReason: null,
    docTradeRegistryUrl: "https://x/trade",
    docTradeRegistryStatus: "PENDING",
    docTradeRegistryReason: null,
    docSignatureCircularUrl: "https://x/sig",
    docSignatureCircularStatus: "PENDING",
    docSignatureCircularReason: null,
    docActivityCertUrl: "https://x/act",
    docActivityCertStatus: "PENDING",
    docActivityCertReason: null,
    docIdFrontUrl: "https://x/idf",
    docIdFrontStatus: "PENDING",
    docIdFrontReason: null,
    docIdBackUrl: "https://x/idb",
    docIdBackStatus: "PENDING",
    docIdBackReason: null,
    isBlocked: false,
    blockedReason: null,
    blockedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    _count: { users: 1, listings: 0, complaintsReceived: 0 },
    openComplaints: 0,
    suppressions: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "";
});

describe("DocsTab — KYC belge inceleme", () => {
  it("Hepsini Onayla → Kararı Kaydet → review (6 belge APPROVED) mutate", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.reviewMutate).toHaveBeenCalledWith(
      {
        id: "c1",
        decisions: {
          taxPlate: { status: "APPROVED" },
          tradeRegistry: { status: "APPROVED" },
          signatureCircular: { status: "APPROVED" },
          activityCert: { status: "APPROVED" },
          idFront: { status: "APPROVED" },
          idBack: { status: "APPROVED" },
        },
      }
    );
  });

  it("bir belgeyi Reddet + gerekçe (kalanlar onaylı) → review mutate", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    await user.type(
      screen.getByLabelText(/Vergi Levhası red notu/),
      "belge okunmuyor",
    );
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.reviewMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "c1",
        decisions: expect.objectContaining({
          taxPlate: { status: "REJECTED", reason: "belge okunmuyor" },
          tradeRegistry: { status: "APPROVED" },
        }),
      })
    );
  });

  it("belge listesini + Görüntüle linklerini gösterir", () => {
    render(<DocsTab companyId="c1" data={detail()} />);
    expect(screen.getByText("Vergi Levhası")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Görüntüle" }).length,
    ).toBeGreaterThan(0);
  });

  it("yabancı firma → 3 belgelik set + bilgi bandı, belge adları ülkeden bağımsız", () => {
    render(<DocsTab companyId="c1" data={detail({ country: "DE" })} />);
    expect(screen.getByText(/Yabancı firma \(Almanya\)/)).toBeInTheDocument();
    // Yalnız 3 zorunlu belge listelenir — İmza Sirküleri görünmez.
    expect(screen.queryByText(/İmza Sirküleri/)).not.toBeInTheDocument();
    // Türk belge adları ("Vergi Levhası", "Ticaret Sicil Gazetesi") yabancıda YOK.
    expect(screen.queryByText("Vergi Levhası")).not.toBeInTheDocument();
    expect(screen.queryByText("Ticaret Sicil Gazetesi")).not.toBeInTheDocument();
    expect(
      screen.getByText("Kuruluş / Sicil Belgesi (Certificate of Incorporation)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Vergi / KDV Kayıt Belgesi (Tax / VAT Certificate)"),
    ).toBeInTheDocument();
  });

  it("zorunlu set API'den gelir (Çin: sicil + kimlik) — admin kendi ikili kuralını uygulamaz", () => {
    render(
      <DocsTab companyId="c1" data={detail({ country: "CN", requiredDocs: ["tradeRegistry", "idFront"] })} />,
    );
    expect(
      screen.getByText("Kuruluş / Sicil Belgesi (Certificate of Incorporation)"),
    ).toBeInTheDocument();
    // Eski ikili kural Çin'e de 3 belge (vergi belgesi dahil) gösteriyordu.
    expect(screen.queryByText(/Tax \/ VAT Certificate/)).not.toBeInTheDocument();
  });

  it("KKTC bilgi bandında ülke adı (harf kodu değil)", () => {
    render(<DocsTab companyId="c1" data={detail({ country: "XN", requiredDocs: ["tradeRegistry", "taxPlate", "signatureCircular", "idFront"] })} />);
    expect(screen.getByText(/Yabancı firma \(Kuzey Kıbrıs Türk Cumhuriyeti/)).toBeInTheDocument();
  });

  /**
   * KODLU GEREKÇE (2026-09-27): çip KOD seçer (firmanın dilinde çevrilir),
   * input isteğe bağlı NOT'tur — eskiden Türkçe cümle input'a dolup olduğu
   * gibi saklanıyordu.
   */
  it("gerekçe çipi KOD seçer; not boşsa yalnız kod gönderilir", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    const chip = screen.getByRole("button", { name: "Belge okunmuyor / bulanık" });
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    // Not input'u doldurulmaz — kod ayrı alan.
    expect(screen.getByLabelText(/Vergi Levhası red notu/)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.reviewMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        decisions: expect.objectContaining({
          taxPlate: { status: "REJECTED", reasonCode: "UNREADABLE" },
        }),
      })
    );
  });

  it("kod + not birlikte gönderilir", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    await user.click(screen.getByRole("button", { name: "Belge güncel değil (son 3 ay)" }));
    await user.type(screen.getByLabelText(/Vergi Levhası red notu/), "2024 tarihli");
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.reviewMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        decisions: expect.objectContaining({
          taxPlate: { status: "REJECTED", reasonCode: "OUTDATED", reason: "2024 tarihli" },
        }),
      })
    );
  });

  it("kod da not da yoksa kaydetmez", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.reviewMutate).not.toHaveBeenCalled();
  });

  it("saklanan kodlu gerekçe ön-doldurulur (kod çipi + not); eski serbest metin nota düşer", () => {
    const { unmount } = render(
      <DocsTab
        companyId="c1"
        data={detail({ docTaxPlateStatus: "REJECTED", docTaxPlateReason: "[MISMATCH] Unvan farklı" })}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Bilgiler firma bilgileriyle uyuşmuyor" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Vergi Levhası red notu/)).toHaveValue("Unvan farklı");
    unmount();
    render(
      <DocsTab
        companyId="c1"
        data={detail({ docTaxPlateStatus: "REJECTED", docTaxPlateReason: "kaşe yok" })}
      />,
    );
    expect(screen.getByLabelText(/Vergi Levhası red notu/)).toHaveValue("kaşe yok");
  });

  it("dar ekranda Önizle/Görüntüle kartın dışına taşmaz: satır sarılır (yeniden doğrulama webC-14)", () => {
    render(<DocsTab companyId="c1" data={detail()} />);
    const actions = screen.getByTestId("doc-actions-taxPlate");
    const row = actions.parentElement!;
    expect(row.className).toContain("flex-wrap");
    expect(actions.className).toContain("whitespace-nowrap");
    // Başlık tarafı küçülebilir (min-w-0) ve kendi içinde sarılır.
    const title = row.firstElementChild!;
    expect(title.className).toContain("min-w-0");
    expect(title.className).toContain("flex-wrap");
  });

  it("Önizle → sayfa içi iframe açılır, tekrar tıklayınca kapanır", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getAllByRole("button", { name: "Önizle" })[0]!);
    expect(screen.getByTitle("Vergi Levhası önizleme")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Önizlemeyi Kapat" }),
    );
    expect(
      screen.queryByTitle("Vergi Levhası önizleme"),
    ).not.toBeInTheDocument();
  });

  it("karar verilmemiş belge varken kaydetmeye çalışınca hata toast'ı", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.toast.error).toHaveBeenCalled();
    expect(h.reviewMutate).not.toHaveBeenCalled();
  });

  it("sunucu verisi tazelenince (revizyon onayı) kaydedilmemiş red taslağı korunur (D-032)", async () => {
    const user = userEvent.setup();
    const first = detail({ docKeys: { taxPlate: "k-tax", idFront: "k-idf-1" } });
    const { rerender } = render(<DocsTab companyId="c1" data={first} />);
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    await user.type(screen.getByLabelText(/Vergi Levhası red notu/), "okunmuyor");
    // Başka bir belgenin revizyonu onaylandı → yeni nesne (yeni anahtar).
    rerender(
      <DocsTab
        companyId="c1"
        data={detail({ docKeys: { taxPlate: "k-tax", idFront: "k-idf-2" } })}
      />,
    );
    expect(screen.getByLabelText(/Vergi Levhası red notu/)).toHaveValue("okunmuyor");
  });

  it("belgesi değişen satırın taslağı sunucu durumuna döner (görülmeyen belgeye karar taşınmaz)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DocsTab companyId="c1" data={detail({ docKeys: { taxPlate: "k-tax-1" } })} />,
    );
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    expect(screen.getByLabelText(/Vergi Levhası red notu/)).toBeInTheDocument();
    rerender(
      <DocsTab companyId="c1" data={detail({ docKeys: { taxPlate: "k-tax-2" } })} />,
    );
    expect(screen.queryByLabelText(/Vergi Levhası red notu/)).not.toBeInTheDocument();
  });

  it("belgesiz firmada Hepsini Onayla ve Kararı Kaydet pasif, eksik belgeler yazılı (D-200)", () => {
    render(
      <DocsTab
        companyId="c1"
        data={detail({
          docTaxPlateUrl: null,
          docTradeRegistryUrl: null,
          docSignatureCircularUrl: null,
          docActivityCertUrl: null,
          docIdFrontUrl: null,
          docIdBackUrl: null,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Hepsini Onayla" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kararı Kaydet" })).toBeDisabled();
    expect(screen.getByText(/Eksik belge: Vergi Levhası/)).toBeInTheDocument();
  });

  it("kısmen yüklü firmada yalnız yüklenenler işaretlenir", async () => {
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail({ docIdBackUrl: null })} />);
    await user.click(screen.getByRole("button", { name: "Yüklenenleri Onayla" }));
    expect(screen.getByRole("button", { name: "Kararı Kaydet" })).toBeDisabled();
  });

  it("doğrulanmış firmada belge reddi önce onay penceresi açar; onayda kaydeder (D-191)", async () => {
    const user = userEvent.setup();
    render(
      <DocsTab
        companyId="c1"
        data={detail({
          companyVerificationStatus: "VERIFIED",
          docTaxPlateStatus: "APPROVED",
          docTradeRegistryStatus: "APPROVED",
          docSignatureCircularStatus: "APPROVED",
          docActivityCertStatus: "APPROVED",
          docIdFrontStatus: "APPROVED",
          docIdBackStatus: "APPROVED",
        })}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    await user.type(screen.getByLabelText(/Vergi Levhası red notu/), "süresi geçmiş");
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/doğrulamasını geri alır/)).toBeInTheDocument();
    expect(h.reviewMutate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Reddet ve Kaydet" }));
    expect(h.reviewMutate).toHaveBeenCalledTimes(1);
  });

  it("doğrulanmış firmada gerekçesiz red → hata toast'ı tek sefer, pencere açılmaz", async () => {
    const user = userEvent.setup();
    render(
      <DocsTab
        companyId="c1"
        data={detail({
          companyVerificationStatus: "VERIFIED",
          docTaxPlateStatus: "APPROVED",
          docTradeRegistryStatus: "APPROVED",
          docSignatureCircularStatus: "APPROVED",
          docActivityCertStatus: "APPROVED",
          docIdFrontStatus: "APPROVED",
          docIdBackStatus: "APPROVED",
        })}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Reddet" })[0]!);
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(h.reviewMutate).not.toHaveBeenCalled();
  });

  it("kuyruktan gelindiyse karar sonrası aynı kuyruk sayfasına döner (D-198)", async () => {
    h.search = "from=queue&qp=3";
    const user = userEvent.setup();
    render(<DocsTab companyId="c1" data={detail()} />);
    await user.click(screen.getByRole("button", { name: "Hepsini Onayla" }));
    await user.click(screen.getByRole("button", { name: "Kararı Kaydet" }));
    await vi.waitFor(() =>
      expect(h.push).toHaveBeenCalledWith("/admin/basvurular?page=3"),
    );
  });
});
