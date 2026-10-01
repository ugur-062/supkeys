// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemberCta, SessionSwap } from "../member-cta";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * Arayüz testi Y-03 / kullanıcı kararı T-02: herkese açık "Bilgi iste" /
 * "Talep aç" oturumlu ama Gold olmayan üyeye Gold gerektiğini TIKLAMADAN
 * önce söyler; misafir mevcut akışı aynen görür.
 */
function signIn(tier: string | null, status = "VERIFIED", permissions: string[] = ["buy:view", "buy:inquiry:send"]) {
  useCompanyAuthStore.setState({
    isHydrated: true,
    user: tier ? ({ id: "u", permissions, roles: [] } as never) : null,
    company: tier ? ({ tier, companyVerificationStatus: status } as never) : null,
  });
}

const guest = <a href="/company/login">Bilgi iste (misafir)</a>;
const member = <a href="/company/urun/a/b#bilgi-iste">Bilgi iste (üye)</a>;

beforeEach(() => signIn(null));

describe("MemberCta", () => {
  it("misafir: sunucunun bastığı misafir CTA'sı", () => {
    render(<MemberCta action="inquiry" member={member}>{guest}</MemberCta>);
    expect(screen.getByText("Bilgi iste (misafir)")).toBeInTheDocument();
  });

  it("Gold ∧ yetki: doğrudan üye hedefi", () => {
    signIn("GOLD");
    render(<MemberCta action="inquiry" member={member}>{guest}</MemberCta>);
    expect(screen.getByText("Bilgi iste (üye)")).toBeInTheDocument();
    expect(screen.queryByText("Bilgi iste (misafir)")).toBeNull();
  });

  it("Silver, doğrulanmış: Gold uyarısı + Gold'a geç (duvar sürprizi yok)", () => {
    signIn("SILVER");
    render(<MemberCta action="inquiry" member={member}>{guest}</MemberCta>);
    expect(screen.getByText("Bilgi talebi Gold paketiyle gönderilir")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gold paketine geç" })).toHaveAttribute("href", "/company/premium");
    expect(screen.queryByText("Bilgi iste (misafir)")).toBeNull();
  });

  it("ücretsiz, doğrulanmamış: önce ücretsiz doğrulama", () => {
    signIn("STANDART", "UNVERIFIED");
    render(<MemberCta action="listing">{guest}</MemberCta>);
    expect(screen.getByText("Talep açmak Gold paketiyle açılır")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Önce ücretsiz doğrulan" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
  });

  it("Gold ama talep açma yetkisi yok: yetki notu", () => {
    signIn("GOLD", "VERIFIED", ["buy:view"]);
    render(<MemberCta action="listing">{guest}</MemberCta>);
    expect(screen.getByText("Talep açmak için talep yönetme yetkisi gerekir.")).toBeInTheDocument();
  });

  it("compact: kilitli bağlantı '… · Gold'", () => {
    signIn("SILVER");
    render(
      <MemberCta action="listing" compact compactLabel="Talep aç">
        {guest}
      </MemberCta>,
    );
    expect(screen.getByRole("link", { name: /Talep aç · Gold/ })).toHaveAttribute("href", "/company/premium");
  });
});

describe("SessionSwap", () => {
  it("oturum varsa üye hedefini, yoksa misafir CTA'sını çizer", () => {
    const { unmount } = render(<SessionSwap member={<span>üye</span>}>{<span>misafir</span>}</SessionSwap>);
    expect(screen.getByText("misafir")).toBeInTheDocument();
    unmount();
    signIn("STANDART");
    render(<SessionSwap member={<span>üye</span>}>{<span>misafir</span>}</SessionSwap>);
    expect(screen.getByText("üye")).toBeInTheDocument();
  });
});
