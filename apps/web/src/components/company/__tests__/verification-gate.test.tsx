// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import {
  VERIFY_HREF,
  VerificationButton,
  VerificationGate,
  VerificationLink,
  VerificationLockCard,
} from "../verification-gate";

/**
 * DOĞRULAMA KAPISI — ücretsiz dönem (2026-10-07, kullanıcı kararı: "doğrulanan
 * herkes tam erişimli; hiçbir yerde paket adı ya da fiyat yazmasın").
 * Kilit yüzeyleri paket satmaz: "firma doğrulaması gerekir" + var olan
 * doğrulama akışı. Üç durum AYRI metin taşır: UNVERIFIED (başvur), PENDING
 * (inceleniyor — yeniden belge istenmez), REJECTED (yeniden başvur).
 */
function setCompany(status: string | null, permissions: string[] | null = ["company:manage"]) {
  useCompanyAuthStore.setState({
    company: status ? ({ companyVerificationStatus: status } as never) : null,
    user: permissions ? ({ permissions, roles: [], isOwner: false } as never) : null,
  } as never);
}

afterEach(() => setCompany(null, null));

/** Paket adı / fiyat sözcükleri — kapının hiçbir durumunda ekranda olamaz. */
const PLAN_WORDS = /silver|gold|standart|premium|paket|\bplan|ücretli|fiyat|yüksel/i;

const STATES = [
  {
    status: "UNVERIFIED",
    key: "unverified",
    short: "Firma doğrulaması gerekir",
    body: /doğrulanmış firmalara açıktır/,
    cta: "Firmanızı doğrulayın",
  },
  {
    status: "PENDING",
    key: "pending",
    short: "Doğrulamanız inceleniyor",
    body: /Belgeleriniz ekibimizce inceleniyor/,
    cta: "Doğrulama durumunu gör",
  },
  {
    status: "REJECTED",
    key: "rejected",
    short: "Doğrulama başvurunuz onaylanmadı — yeniden başvurun",
    body: /düzeltip yeniden başvurun/,
    cta: "Yeniden başvurun",
  },
] as const;

describe("VerificationGate (sayfa kapısı)", () => {
  it.each(STATES)("$status → kendi metni + doğrulama akışına tek eylem", ({ status, key, short, body, cta }) => {
    setCompany(status);
    render(<VerificationGate />);
    const gate = screen.getByTestId("verification-gate");
    expect(gate).toHaveAttribute("data-state", key);
    expect(screen.getByRole("heading", { name: "Bu sayfa firma doğrulaması gerektirir" })).toBeInTheDocument();
    expect(screen.getByText(short)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(cta);
    expect(links[0]).toHaveAttribute("href", VERIFY_HREF);
    expect(gate.textContent).not.toMatch(PLAN_WORDS);
  });

  it("üç durumun metni birbirinden farklıdır", () => {
    const bodies = STATES.map(({ status }) => {
      setCompany(status);
      const { unmount } = render(<VerificationGate />);
      const text = screen.getByTestId("verification-gate").textContent;
      unmount();
      return text;
    });
    expect(new Set(bodies).size).toBe(3);
  });

  it("VERIFIED ama kapı çiziliyorsa (bayat /me): paket değil 'sayfayı yenileyin' — bağlantı yok", () => {
    setCompany("VERIFIED");
    render(<VerificationGate />);
    expect(screen.getByTestId("verification-gate")).toHaveAttribute("data-state", "verified");
    expect(screen.getByText(/Sayfayı yenileyin/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sayfayı yenile" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("verification-gate").textContent).not.toMatch(PLAN_WORDS);
  });

  it("başvuruyu yapamayan üye (company:manage yok): düğme yerine 'firma yöneticinize iletin'", () => {
    setCompany("UNVERIFIED", ["sell:view"]);
    render(<VerificationGate />);
    expect(screen.getByText(/firma yöneticiniz yapabilir/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("çağıranın başlığı kullanılır", () => {
    setCompany("UNVERIFIED");
    render(<VerificationGate title="Satınalma paneli firma doğrulamasıyla açılır" />);
    expect(screen.getByRole("heading", { name: "Satınalma paneli firma doğrulamasıyla açılır" })).toBeInTheDocument();
  });
});

describe("VerificationLockCard / VerificationButton / VerificationLink", () => {
  it.each(STATES)("$status → kart, düğme ve metin içi bağlantı aynı eylemi taşır", ({ status, cta, body }) => {
    setCompany(status);
    render(
      <>
        <VerificationLockCard title="Kilitli" description="Açıklama" meta="4 talep" />
        <VerificationButton />
        <p>
          metin
          <VerificationLink />
        </p>
      </>,
    );
    expect(screen.getByRole("region", { name: "Kilitli" })).toHaveTextContent("4 talep");
    expect(screen.getByText(body)).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: cta });
    expect(links).toHaveLength(3);
    for (const a of links) expect(a).toHaveAttribute("href", VERIFY_HREF);
    expect(document.body.textContent).not.toMatch(PLAN_WORDS);
  });

  it("kart dipnotu: verilmezse davetli/bağlantılı talep notu, null → dipnot yok", () => {
    setCompany("UNVERIFIED");
    const { unmount } = render(<VerificationLockCard title="K" description="d" />);
    expect(screen.getByText(/doğrulama beklemeden teklif verebilirsiniz/)).toBeInTheDocument();
    unmount();
    render(<VerificationLockCard title="K" description="d" footnote={null} />);
    expect(screen.queryByText(/doğrulama beklemeden teklif verebilirsiniz/)).not.toBeInTheDocument();
  });

  it("doğrulanmış firmada metin içi bağlantı çizilmez", () => {
    setCompany("VERIFIED");
    render(
      <p>
        metin
        <VerificationLink />
      </p>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
