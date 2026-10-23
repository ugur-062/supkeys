// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemberCta, OpenRequestLink, SessionSwap } from "../member-cta";
import { PublicEmptyState } from "../public-empty-state";
import { RfqBanner } from "../rfq-banner";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * Arayüz testi Y-03 / kullanıcı kararı T-02: herkese açık "Bilgi iste" /
 * "Talep aç" oturumlu ama firması doğrulanmamış üyeye firma doğrulaması
 * gerektiğini TIKLAMADAN önce söyler; misafir mevcut akışı aynen görür.
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): doğrulanmış firmanın `/me` kademesi efektif
 * olarak en üst kademedir ("GOLD" — iç tanımlayıcı, arayüzde yazılmaz);
 * doğrulanmamış firma "STANDART" kalır. Kapalı kapının iki dalı da doğrulama
 * sayfasına gider; hiçbir metinde paket adı geçmez.
 */
const VERIFY = "/company/ayarlar/dogrulama";
const PACKAGE_WORDS = /Gold|Silver|paket|premium/i;
function signIn(
  tier: string | null,
  status = "VERIFIED",
  permissions: string[] = ["buy:view", "buy:inquiry:send"],
  slug = "alici",
) {
  useCompanyAuthStore.setState({
    isHydrated: true,
    user: tier ? ({ id: "u", permissions, roles: [] } as never) : null,
    company: tier ? ({ tier, companyVerificationStatus: status, slug } as never) : null,
  });
}

/* eslint-disable @next/next/no-html-link-for-pages -- yalnızca yer tutucu düğümler; MemberCta yalnızca hangisinin çizildiğine bakar */
const guest = <a href="/company/login">Bilgi iste (misafir)</a>;
const member = <a href="/company/urun/a/b#bilgi-iste">Bilgi iste (üye)</a>;
/* eslint-enable @next/next/no-html-link-for-pages */

beforeEach(() => signIn(null));

describe("MemberCta", () => {
  it("misafir: sunucunun bastığı misafir CTA'sı", () => {
    render(<MemberCta action="inquiry" member={member}>{guest}</MemberCta>);
    expect(screen.getByText("Bilgi iste (misafir)")).toBeInTheDocument();
  });

  it("doğrulanmış ∧ yetki: doğrudan üye hedefi", () => {
    signIn("GOLD");
    render(<MemberCta action="inquiry" member={member}>{guest}</MemberCta>);
    expect(screen.getByText("Bilgi iste (üye)")).toBeInTheDocument();
    expect(screen.queryByText("Bilgi iste (misafir)")).toBeNull();
  });

  it("doğrulama incelemede: doğrulama uyarısı + durum bağlantısı (duvar sürprizi yok, yeniden başvuru istenmez)", () => {
    signIn("STANDART", "PENDING");
    const { container } = render(<MemberCta action="inquiry" member={member}>{guest}</MemberCta>);
    expect(screen.getByText("Bilgi talebi göndermek için firma doğrulaması gerekir")).toBeInTheDocument();
    expect(screen.getByText(/Doğrulamanız inceleniyor/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Doğrulama durumunu görün" })).toHaveAttribute("href", VERIFY);
    expect(screen.queryByText("Bilgi iste (misafir)")).toBeNull();
    expect(container.textContent).not.toMatch(PACKAGE_WORDS);
  });

  it("doğrulama reddedilmiş: yeniden başvuru", () => {
    signIn("STANDART", "REJECTED");
    render(<MemberCta action="inquiry" member={member}>{guest}</MemberCta>);
    expect(screen.getByText(/Doğrulama başvurunuz onaylanmadı/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yeniden başvurun" })).toHaveAttribute("href", VERIFY);
  });

  // webA-03 yeniden doğrulama: herkese açık sayfa yetkisiz satıcıya KENDİ ürünü
  // için kapı uyarısı çiziyordu (panel ve üye sayfası D-230 notunu verir).
  it("kendi ürünü: doğrulama uyarısı yerine 'sizin firmanıza ait' notu (yetki ve izinden önce)", () => {
    signIn("STANDART", "UNVERIFIED", ["buy:view"], "satici");
    render(<MemberCta action="inquiry" sellerSlug="satici" member={member}>{guest}</MemberCta>);
    expect(screen.getByText(/Bu ürün sizin firmanıza ait/)).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Bilgi iste (misafir)")).toBeNull();
  });

  it("başka firmanın ürünü: sellerSlug kapıyı değiştirmez", () => {
    signIn("GOLD", "VERIFIED", undefined, "alici");
    render(<MemberCta action="inquiry" sellerSlug="satici" member={member}>{guest}</MemberCta>);
    expect(screen.getByText("Bilgi iste (üye)")).toBeInTheDocument();
  });

  it("doğrulanmamış: ücretsiz doğrulama", () => {
    signIn("STANDART", "UNVERIFIED");
    const { container } = render(<MemberCta action="listing">{guest}</MemberCta>);
    expect(screen.getByText("Talep açmak için firma doğrulaması gerekir")).toBeInTheDocument();
    expect(screen.getByText(/Doğrulama ücretsizdir/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Firmanızı ücretsiz doğrulayın" })).toHaveAttribute("href", VERIFY);
    expect(container.textContent).not.toMatch(PACKAGE_WORDS);
  });

  it("doğrulanmış ama talep açma yetkisi yok: yetki notu", () => {
    signIn("GOLD", "VERIFIED", ["buy:view"]);
    render(<MemberCta action="listing">{guest}</MemberCta>);
    expect(screen.getByText("Talep açmak için talep yönetme yetkisi gerekir.")).toBeInTheDocument();
  });

  it("compact: kilitli bağlantı '… · Doğrulama gerekli'; incelemede '… · Doğrulama inceleniyor'", () => {
    signIn("STANDART", "UNVERIFIED");
    const { unmount } = render(
      <MemberCta action="listing" compact compactLabel="Talep aç">
        {guest}
      </MemberCta>,
    );
    expect(screen.getByRole("link", { name: "Talep aç · Doğrulama gerekli" })).toHaveAttribute("href", VERIFY);
    unmount();
    signIn("STANDART", "PENDING");
    render(
      <MemberCta action="listing" compact compactLabel="Talep aç">
        {guest}
      </MemberCta>,
    );
    expect(screen.getByRole("link", { name: "Talep aç · Doğrulama inceleniyor" })).toHaveAttribute("href", VERIFY);
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

/**
 * Gözden geçirme (webA-03): dar "Talep aç" girişleri (hero şeridi, boş durum,
 * akış adımı, yüzen düğme) çıplak `signupHref("talep")` basıyordu — oturumlu
 * üye kayıt sayfasından sessizce `/company`ye atılıyordu.
 */
describe("OpenRequestLink", () => {
  const listingPerms = ["buy:view", "buy:listing:manage"];

  it("misafir: yalın \"Talep aç\" kayda (dönüş adresi yok; etikette kilit/paket eki yok)", () => {
    render(<OpenRequestLink label="Talep aç" prefill="pano" />);
    const href = screen.getByRole("link", { name: "Talep aç" }).getAttribute("href") ?? "";
    expect(href).toContain("/company/kayit?intent=talep");
    expect(href).not.toContain("redirect");
  });

  it("doğrulanmış ∧ talep yetkisi: doğrudan sihirbaz, arama terimi ön-dolu", () => {
    signIn("GOLD", "VERIFIED", listingPerms);
    render(<OpenRequestLink label="Talep aç" prefill="pano kutusu" />);
    expect(screen.getByRole("link", { name: "Talep aç" })).toHaveAttribute(
      "href",
      "/company/satinalma/taleplerim/yeni?q=pano%20kutusu",
    );
  });

  it("incelemede: kilitli 'Talep aç · Doğrulama inceleniyor'; doğrulanmamış/reddedilmiş: '· Doğrulama gerekli' — hepsi doğrulamaya", () => {
    signIn("STANDART", "PENDING", listingPerms);
    const first = render(<OpenRequestLink label="Talep aç" />);
    expect(screen.getByRole("link", { name: "Talep aç · Doğrulama inceleniyor" })).toHaveAttribute("href", VERIFY);
    first.unmount();
    signIn("STANDART", "UNVERIFIED", listingPerms);
    const second = render(<OpenRequestLink label="Talep aç" />);
    expect(screen.getByRole("link", { name: "Talep aç · Doğrulama gerekli" })).toHaveAttribute("href", VERIFY);
    second.unmount();
    signIn("STANDART", "REJECTED", listingPerms);
    render(<OpenRequestLink label="Talep aç" />);
    expect(screen.getByRole("link", { name: "Talep aç · Doğrulama gerekli" })).toHaveAttribute("href", VERIFY);
  });

  it("doğrulanmış ama talep yetkisi yok: bağlantı çizilmez", () => {
    signIn("GOLD", "VERIFIED", ["buy:view"]);
    render(<OpenRequestLink label="Talep aç" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("boş durumun 'Talep aç' eylemi de üyenin doğrulama durumuna göre", () => {
    signIn("STANDART", "UNVERIFIED", listingPerms);
    render(<PublicEmptyState title="Talep bulunamadı." openRequest={{ label: "Talep aç" }} />);
    expect(screen.getByRole("link", { name: "Talep aç · Doğrulama gerekli" })).toHaveAttribute("href", VERIFY);
  });
});

describe("RfqBanner (ürün sayfası 'Bir talep aç…')", () => {
  it("misafir: yalın 'Talep aç' kayda — etikette paket adı yok (T-02)", () => {
    render(<RfqBanner prefill="pano" />);
    const link = screen.getByRole("link", { name: "Talep aç" });
    expect(link.getAttribute("href")).toContain("/company/kayit?intent=talep");
    expect(link.getAttribute("href")).not.toContain("redirect");
  });

  it("doğrulanmamış üye: kayıt bağlantısı yerine doğrulama uyarısı", () => {
    signIn("STANDART", "UNVERIFIED", ["buy:view", "buy:listing:manage"]);
    render(<RfqBanner prefill="pano" />);
    expect(screen.getByText("Talep açmak için firma doğrulaması gerekir")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Firmanızı ücretsiz doğrulayın" })).toHaveAttribute("href", VERIFY);
    expect(screen.queryByRole("link", { name: "Talep aç" })).toBeNull();
  });

  it("boş durumun 'Kategorilere göz at' bağlantısı dilin çapasına gider", () => {
    render(<PublicEmptyState title="Talep bulunamadı." />);
    expect(screen.getByRole("link", { name: /Kategori/ })).toHaveAttribute("href", "/#kategoriler");
  });
});
