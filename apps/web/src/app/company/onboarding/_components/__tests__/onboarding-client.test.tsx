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
    sel({ token: "jwt", isHydrated: true }),
}));
vi.mock("@/hooks/use-categories", () => ({
  useRoots: () => h.roots,
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: () => ({ data: h.meData, isLoading: false }),
  useCompleteOnboarding: () => ({
    mutateAsync: h.completeAsync,
    isPending: false,
  }),
  useViesCheck: () => ({ mutateAsync: h.viesAsync, isPending: false }),
}));

import { OnboardingClient } from "../onboarding-client";

async function fillStep1TR(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Firma Ünvanı *"), "Örnek Ltd.");
  await user.type(screen.getByLabelText("Vergi No / TCKN *"), "10000000146");
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

describe("OnboardingClient — adım 1 (şirket)", () => {
  it("zorunlu alanlar boşken 'Devam' devre dışı", () => {
    render(<OnboardingClient />);
    expect(screen.getByRole("button", { name: "Devam" })).toBeDisabled();
  });

  it("TR: il/ilçe/vergi dairesi görünür; DE'ye geçince şehir/eyalet gelir", async () => {
    const user = userEvent.setup();
    render(<OnboardingClient />);
    expect(screen.getByLabelText("İl *")).toBeInTheDocument();
    expect(screen.getByLabelText("Vergi Dairesi *")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Ülke *"), "DE");
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
});

describe("OnboardingClient — adım 2 (kişi + sektör)", () => {
  async function goStep2(user: ReturnType<typeof userEvent.setup>) {
    render(<OnboardingClient />);
    await fillStep1TR(user);
    await user.click(screen.getByRole("button", { name: "Devam" }));
  }

  it("sektör chip'i aria-pressed toggle + 3 sınırı", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    const chip = screen.getByRole("button", { name: "Yazılım & IT" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("TCKN (11 hane) + en az 1 sektör → 'Devam' aktif", async () => {
    const user = userEvent.setup();
    await goStep2(user);
    await user.type(screen.getByLabelText("T.C. Kimlik No *"), "10000000146");
    await user.click(screen.getByRole("button", { name: "Yazılım & IT" }));
    expect(screen.getByRole("button", { name: "Devam" })).toBeEnabled();
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
    await user.click(screen.getByRole("button", { name: "Yazılım & IT" }));
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
        taxNumber: "10000000146",
        authorizedTckn: "10000000146",
        mainCategoryIds: ["cat1"],
        declarationAccepted: true,
      }),
    );
  });
});

describe("OnboardingClient — VIES (yabancı)", () => {
  it("AB ülkesinde VIES butonu görünür + doğrulama çağrılır", async () => {
    const user = userEvent.setup();
    h.viesAsync.mockResolvedValue({ valid: true, name: "ACME GmbH" });
    render(<OnboardingClient />);
    await user.selectOptions(screen.getByLabelText("Ülke *"), "DE");
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
    await user.selectOptions(screen.getByLabelText("Ülke *"), "DE");
    await user.type(screen.getByLabelText("Vergi / Sicil No *"), "DE811234567");
    await user.click(screen.getByRole("button", { name: /VIES ile doğrula/i }));
    expect(h.toast.error).toHaveBeenCalled();
  });
});
