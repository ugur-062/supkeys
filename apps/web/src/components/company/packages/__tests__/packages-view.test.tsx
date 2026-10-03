// @vitest-environment jsdom
/**
 * PAKETLER — SÖZLEŞME (2026-09-15, kullanıcı kararı).
 *
 * "Sadece paketlerde gözüksün, şık bir şekilde; önce doğrulamaya yönlendirsin,
 * doğrulanmışsa direkt satın alma ekranı gelsin."
 *
 * Kilitlenenler:
 *  · ekran yalnız üç paket kartıdır — eski "neler açılır" listesi, doğrulama
 *    kutusu ve "manuel onayla" notu YOK
 *  · satın al: doğrulanmamış → doğrulama sayfası; incelemede (PENDING) → düğme
 *    pasif + "inceleniyor" notu (arayüz testi O-068); doğrulanmış → satın alma ekranı
 *  · paket işlemi yalnız kurucuda (backend `upgradeToPremium` aynası)
 *  · mevcut ve alt paketlerde satın al düğmesi çizilmez
 *  · fiyat pazarlama sayfasıyla AYNI kaynaktan (`lib/pricing/plans.ts`)
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  meData: undefined as unknown,
  profile: undefined as unknown,
  profileEnabled: undefined as boolean | undefined,
  push: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: h.push }) }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyMe: () => ({ data: h.meData }),
}));
vi.mock("@/hooks/use-company-profile", () => ({
  useCompanyProfile: (enabled?: boolean) => {
    h.profileEnabled = enabled;
    return { data: enabled === false ? undefined : h.profile };
  },
}));

import { PRICING_PLANS } from "@/lib/pricing/plans";
import { PackagesView } from "../packages-view";

function setMe({
  status = "VERIFIED",
  tier = "STANDART",
  isOwner = true,
}: { status?: string; tier?: string; isOwner?: boolean } = {}) {
  h.meData = {
    company: { companyVerificationStatus: status, tier, name: "Deneme A.Ş." },
    user: { isOwner },
    selfUpgradeEnabled: false,
  };
}

const card = (name: string) => screen.getByRole("listitem", { name: `${name} paketi` });

beforeEach(() => {
  vi.clearAllMocks();
  h.profile = undefined;
});

describe("PackagesView", () => {
  it("yalnız üç paket kartı çizer — eski kapı metinleri YOK", () => {
    setMe();
    render(<PackagesView />);
    for (const p of PRICING_PLANS) expect(card(p.name)).toBeInTheDocument();
    expect(screen.queryByText(/Paketle neler açılır/)).toBeNull();
    expect(screen.queryByText(/manuel onayla/i)).toBeNull();
    expect(screen.queryByText(/paketli üyelere özel/)).toBeNull();
  });

  it("fiyat tek kaynaktan gelir", () => {
    setMe();
    render(<PackagesView />);
    const gold = PRICING_PLANS.find((p) => p.tier === "GOLD")!;
    expect(within(card("Gold")).getByText(`$${gold.monthlyUsd}`)).toBeInTheDocument();
  });

  it("DOĞRULANMAMIŞ firma satın al'a basınca doğrulama sayfasına gider", async () => {
    const user = userEvent.setup();
    setMe({ status: "UNVERIFIED" });
    render(<PackagesView />);
    // Yönlendirme sürpriz olmasın: kart önceden söyler.
    expect(within(card("Gold")).getByText("Önce ücretsiz doğrulama")).toBeInTheDocument();

    await user.click(within(card("Gold")).getByRole("button", { name: "Gold satın al" }));
    expect(h.push).toHaveBeenCalledWith("/company/ayarlar/dogrulama");
    expect(h.toast.info).toHaveBeenCalledTimes(1);
  });

  it("PENDING (incelemede): 'önce doğrulayın' demez, düğme pasif ve 'inceleniyor' notu (O-068)", async () => {
    setMe({ status: "PENDING" });
    render(<PackagesView />);
    const silver = card("Silver");
    expect(within(silver).getByRole("button", { name: "Silver satın al" })).toBeDisabled();
    expect(within(silver).getByText(/Doğrulamanız inceleniyor/)).toBeInTheDocument();
    expect(within(silver).getByRole("link", { name: "Durumu gör" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    expect(screen.queryByText("Önce ücretsiz doğrulama")).toBeNull();
    expect(h.push).not.toHaveBeenCalled();
    expect(h.toast.info).not.toHaveBeenCalled();
  });

  it("DOĞRULANMIŞ firma doğrudan satın alma ekranına gider", async () => {
    const user = userEvent.setup();
    setMe({ status: "VERIFIED" });
    render(<PackagesView />);
    expect(screen.queryByText("Önce ücretsiz doğrulama")).toBeNull();

    await user.click(within(card("Silver")).getByRole("button", { name: "Silver satın al" }));
    expect(h.push).toHaveBeenCalledWith("/company/premium/satin-al?paket=silver");
    expect(h.toast.info).not.toHaveBeenCalled();
  });

  it("mevcut ve alt paket satın alınamaz", () => {
    setMe({ tier: "SILVER" });
    render(<PackagesView />);
    expect(within(card("Silver")).getByText("Mevcut paketiniz")).toBeInTheDocument();
    expect(within(card("Silver")).queryByRole("button")).toBeNull();
    expect(within(card("Standart")).getByText("Paketinize dahil")).toBeInTheDocument();
    expect(within(card("Gold")).getByRole("button", { name: "Gold satın al" })).toBeEnabled();
  });

  it("kurucu olmayan üyede düğme pasif ve nedenini yazar", () => {
    setMe({ isOwner: false });
    render(<PackagesView />);
    expect(within(card("Gold")).getByRole("button", { name: "Gold satın al" })).toBeDisabled();
    expect(within(card("Gold")).getByText("Paketi firma kurucusu satın alabilir")).toBeInTheDocument();
  });

  it("üyelik bitişi: mevcut ücretli kartta 'Bitiş', süresi dolmuş Standart firmada bant (D-029)", () => {
    setMe({ tier: "GOLD" });
    h.profile = { membership: { endsAt: "2026-12-31T09:00:00.000Z", expiredAt: null } };
    const { unmount } = render(<PackagesView />);
    expect(within(card("Gold")).getByText("Bitiş: 31 Aralık 2026")).toBeInTheDocument();
    expect(h.profileEnabled).toBe(true);
    unmount();

    setMe({ tier: "STANDART" });
    h.profile = { membership: { endsAt: null, expiredAt: "2026-09-30T09:00:00.000Z" } };
    render(<PackagesView />);
    expect(screen.getByRole("status")).toHaveTextContent(/30 Eylül 2026 tarihinde doldu/);
  });

  it("kurucu olmayan üyede profil (üyelik) sorgusu atılmaz", () => {
    setMe({ isOwner: false });
    render(<PackagesView />);
    expect(h.profileEnabled).toBe(false);
  });

  it("kilitli sayfadan gelindiyse gereken paketi söyler", () => {
    setMe();
    render(<PackagesView requiredTier="GOLD" />);
    expect(screen.getByText("Bu sayfa Gold paketiyle açılır.")).toBeInTheDocument();
  });
});
