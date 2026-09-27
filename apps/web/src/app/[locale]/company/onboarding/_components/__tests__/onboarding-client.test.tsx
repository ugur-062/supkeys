// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  meData: {
    user: { firstName: "Ada", lastName: "Yılmaz" },
    company: { onboardingCompletedAt: null },
  } as unknown,
  completeAsync: vi.fn(),
  viesAsync: vi.fn(),
  roots: {
    data: [
      { id: "cat1", nameTr: "Yazılım & IT" },
      { id: "cat2", nameTr: "İnşaat" },
    ] as unknown[] | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u1" }, isHydrated: true }),
}));
vi.mock("@/hooks/use-categories", () => ({
  useRoots: () => h.roots,
  // Alt kategori seçici (CategorySelectorButton) seçili kodların adını bu
  // hook'tan çözer. Onboarding'e 2026-09-01'de eklendi; mock'a yazılmazsa
  // vitest "No export is defined" ile patlar.
  useCategoriesByIds: () => ({ data: [] }),
  useAllCategories: () => ({ data: [], isLoading: false }),
  useCategorySearchTree: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: () => ({ data: h.meData, isLoading: false }),
  useCompleteOnboarding: () => ({
    mutateAsync: h.completeAsync,
    isPending: false,
  }),
  useViesCheck: () => ({ mutateAsync: h.viesAsync, isPending: false }),
}));

vi.mock("@/lib/public/geo-client", () => ({ searchGeoCities: vi.fn(async () => []) }));

import { OnboardingClient } from "../onboarding-client";

// LIMITED (tüzel) → 10 haneli VKN; TR'de vergi dairesi zorunlu (backend mirror).
async function fillStep1TR(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Firma Unvanı *"), "Örnek Ltd.");
  await user.type(screen.getByLabelText("Vergi No / TCKN *"), "1234567890");
  await user.type(screen.getByLabelText("Vergi Dairesi *"), "Kadıköy VD");
  await user.selectOptions(screen.getByLabelText("İl *"), "İstanbul");
  await user.selectOptions(screen.getByLabelText("İlçe *"), "Kadıköy");
  await user.type(screen.getByLabelText("Açık Adres *"), "Moda Cad. No:1");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.roots.isError = false;
  h.roots.data = [
    { id: "cat1", nameTr: "Yazılım & IT" },
    { id: "cat2", nameTr: "İnşaat" },
  ];
});

/** Aranabilir ülke seçicide (Combobox) ülke seç — 245 ülkelik native liste yerine (2026-09-27). */
async function pickCountry(user: ReturnType<typeof userEvent.setup>, query: string, name: string) {
  const box = screen.getByRole("combobox", { name: /^Ülke/ });
  await user.clear(box);
  await user.type(box, query);
  await user.click(await screen.findByRole("option", { name: new RegExp(name) }));
}

describe("OnboardingClient — adım 1 (şirket)", () => {
  it("zorunlu alanlar boşken 'Devam' devre dışı", () => {
    render(<OnboardingClient />);
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });

  it("TR: il/ilçe/vergi dairesi görünür; yabancıya (KZ) geçince şehir/eyalet gelir", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("İl *")).toBeInTheDocument();
    expect(screen.getByLabelText("Vergi Dairesi *")).toBeInTheDocument();

    await pickCountry(user, "Kazak", "Kazakistan");
    expect(screen.queryByLabelText("İl *")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Şehir *")).toBeInTheDocument();
    expect(screen.getByLabelText("Eyalet / Bölge")).toBeInTheDocument();
  });

  it("TR alanları doldurunca 'Devam' aktifleşir", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await fillStep1TR(user);
    expect(screen.getByRole("button", { name: "Devam" })).toBeEnabled();
  });

  // B (kök neden): form artık backend'in shared kimlik yardımcılarını kullanır —
  // geçersiz VKN aynı kuralla formda yakalanır (11 hane, tüzel için VKN=10 hane).
  it("geçersiz VKN (11 hane, tüzel) → hata gösterilir + 'Devam' devre dışı", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    await user.type(screen.getByLabelText("Firma Unvanı *"), "Örnek Ltd.");
    await user.type(screen.getByLabelText("Vergi No / TCKN *"), "10000000146");
    await user.type(screen.getByLabelText("Vergi Dairesi *"), "Kadıköy VD");
    await user.selectOptions(screen.getByLabelText("İl *"), "İstanbul");
    await user.selectOptions(screen.getByLabelText("İlçe *"), "Kadıköy");
    await user.type(screen.getByLabelText("Açık Adres *"), "Moda Cad. No:1");
    expect(
      screen.getByText(/10 haneli geçerli vergi numarası/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });
});

describe("OnboardingClient — adım 2 (kişi + sektör)", () => {
  async function goStep2(user: ReturnType<typeof userEvent.setup>) {
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
  }

  // 2026-09-14: ekran TEK soru soruyor — kullanıcı somut ürün/hizmeti seçer,
  // segment koddan TÜRETİLİR. Bir segmentin tamamında çalışan firma için
  // "Sektör geneli ekle" kaçış yolu duruyor ve bu testler onu kullanıyor
  // (birim testte katalog ağacı mock'lu, yaprak seçimi yolu e2e'de).
  async function pickSector(
    user: ReturnType<typeof userEvent.setup>,
    name: RegExp,
  ) {
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
  }

  it("sektör modalı: aç → option aria-selected toggle → onayla, seçim yansır", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    const opt = screen.getByRole("option", { name: /Yazılım & IT/ });
    expect(opt).toHaveAttribute("aria-selected", "false");
    await user.click(opt);
    expect(opt).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    // Modal kapanır, seçili çip trigger'da görünür.
    expect(screen.getByText("Yazılım & IT")).toBeInTheDocument();
  });

  it("TCKN (11 hane) + en az 1 sektör → 'Devam' aktif", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await pickSector(user, /Yazılım & IT/);
    expect(screen.getByRole("button", { name: "Devam" })).toBeEnabled();
  });

  // B: yetkili TCKN checksum'lı doğrulanır (backend isValidTckn birebir).
  it("geçersiz TCKN (checksum hatalı) → hata + 'Devam' devre dışı", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000140");
    await pickSector(user, /Yazılım & IT/);
    expect(
      screen.getByText(/Geçerli bir T\.C\. Kimlik No/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });

  it("kategori yüklenemezse hata + 'Tekrar dene'", async () => {
    const user = userEvent.setup();
    h.roots.isError = true;
    h.roots.data = undefined;
    await goStep2(user);
    expect(screen.getByText(/Sektörler yüklenemedi/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.roots.refetch).toHaveBeenCalled();
  });
});

describe("OnboardingClient — adım 3 (özet + gönderim)", () => {
  it("beyan onayı + Tamamla → completeOnboarding beklenen payload'la çağrılır", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    // Sektör: "Sektör geneli ekle" → seç → onayla.
    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));

    const tamamla = screen.getByRole("button", { name: "Tamamla" });
    expect(tamamla).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /doğru ve güncel olduğunu beyan/i,
      }),
    );
    expect(tamamla).toBeEnabled();
    await user.click(tamamla);

    expect(h.completeAsync).toHaveBeenCalledTimes(1);
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        legalName: "Örnek Ltd.",
        country: "TR",
        taxNumber: "1234567890",
        authorizedTckn: "10000000146",
        mainCategoryIds: ["cat1"],
        declarationAccepted: true,
      }),
    );
  });
});

/**
 * VIES — AB ülkelerinde KDV numarası doğrulama. 2026-09-01 – 09-27 arası AB
 * kayda kapalıydı ve bu testler atlanıyordu; kayıt tüm ülkelere açılınca
 * (ABD ve yaptırım ülkeleri hariç) yeniden etkin.
 */
describe("OnboardingClient — VIES (AB ülkeleri)", () => {
  it("AB ülkesinde VIES butonu görünür + doğrulama çağrılır", async () => {
    const user = userEvent.setup();
    h.viesAsync.mockResolvedValue({ valid: true, name: "ACME GmbH" });
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await user.type(screen.getByLabelText("Vergi / Sicil No *"), "DE811234567");

    const viesBtn = screen.getByRole("button", { name: /VIES ile doğrula/i });
    await user.click(viesBtn);
    expect(h.viesAsync).toHaveBeenCalledWith({
      countryCode: "DE",
      vatNumber: "DE811234567",
    });
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("VIES hata fırlatırsa yakalanır (unhandled rejection yok)", async () => {
    const user = userEvent.setup();
    h.viesAsync.mockRejectedValue(new Error("network"));
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await user.type(screen.getByLabelText("Vergi / Sicil No *"), "DE811234567");
    await user.click(screen.getByRole("button", { name: /VIES ile doğrula/i }));
    expect(h.toast.error).toHaveBeenCalled();
  });
});

/**
 * Yabancı firma (2026-09-27): ayrı teslimat adresinde dünya şehir seçici +
 * eyalet/bölge; özet ekranı "TCKN"/"Vergi dairesi" göstermez, "Diğer" hukuki
 * yapıda yerel adı basar.
 */
describe("OnboardingClient — yabancı firma", () => {
  it("DE: ayrı teslimat eyaleti gönderilir; özet yerel hukuki yapı + yabancı vergi etiketi", async () => {
    const user = userEvent.setup();
    h.completeAsync.mockResolvedValue({ ok: true });
    render(<OnboardingClient />);
    await pickCountry(user, "Alman", "Almanya");
    await user.type(screen.getByLabelText("Firma Unvanı *"), "Müller Handel");
    await user.selectOptions(screen.getByLabelText("Firma Türü *"), "OTHER");
    await user.type(screen.getByLabelText(/Hukuki yapı \(yerel/i), "GmbH");
    await user.type(screen.getByLabelText("Vergi / Sicil No *"), "DE811234567");
    await user.type(screen.getByLabelText("Şehir *"), "München");
    await user.type(screen.getAllByLabelText("Eyalet / Bölge")[0], "Bayern");
    await user.type(screen.getByLabelText("Açık Adres *"), "Leopoldstr. 1");
    await user.click(screen.getByRole("checkbox", { name: /teslimat adresi olarak kullan/i }));
    const cities = screen.getAllByLabelText("Şehir *");
    expect(cities).toHaveLength(2);
    await user.type(cities[1], "Hamburg");
    const states = screen.getAllByLabelText("Eyalet / Bölge");
    expect(states).toHaveLength(2);
    await user.type(states[1], "Hamburg");
    await user.type(screen.getAllByLabelText("Açık Adres *")[1], "Hafenstr. 2");
    await user.click(screen.getByRole("button", { name: "Devam" }));

    await user.click(screen.getByRole("button", { name: /Sektör geneli ekle/ }));
    await user.click(screen.getByRole("option", { name: /Yazılım & IT/ }));
    await user.click(screen.getByRole("button", { name: /Onayla/ }));
    await user.click(screen.getByRole("button", { name: "Devam" }));

    expect(screen.getByText("Vergi / Sicil No")).toBeInTheDocument();
    expect(screen.queryByText("Vergi No / TCKN")).not.toBeInTheDocument();
    expect(screen.queryByText("Vergi Dairesi")).not.toBeInTheDocument();
    expect(screen.getByText("GmbH")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /doğru ve güncel olduğunu beyan/i }));
    await user.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(h.completeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "DE",
        legalFormLocal: "GmbH",
        stateRegion: "Bayern",
        deliverySameAsBilling: false,
        deliveryCity: "Hamburg",
        deliveryStateRegion: "Hamburg",
        deliveryAddressLine: "Hafenstr. 2",
      }),
    );
  }, 40_000); // Dört adımlı tam form + iki birleşik seçici: tam pakette yük altında 15 sn yetmiyor.
});
