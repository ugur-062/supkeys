// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DOĞRULAMA TEŞVİKİ (2026-09-28, kullanıcı: "ücretsiz firmaları doğrulamaya da
 * teşvik etmeliyiz"): teklif veren doğrulanmamış firma alıcının onu
 * "Doğrulanmamış firma" olarak göreceğini öğrenir; doğrulanmış ya da
 * incelemedeki firmaya uyarı çizilmez.
 */
const h = vi.hoisted(() => ({ company: null as null | { companyVerificationStatus: string } }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ company: h.company }) }));

import { VerifyNudge } from "../verify-nudge";

beforeEach(() => {
  h.company = null;
});

describe("VerifyNudge", () => {
  it.each(["UNVERIFIED", "REJECTED"])("%s → uyarı + doğrulama bağlantısı", (status) => {
    h.company = { companyVerificationStatus: status };
    render(<VerifyNudge />);
    expect(screen.getByText("Teklifiniz alıcıya “Doğrulanmamış firma” olarak görünür")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ücretsiz doğrulan" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
  });

  it.each(["VERIFIED", "PENDING"])("%s → çizilmez", (status) => {
    h.company = { companyVerificationStatus: status };
    const { container } = render(<VerifyNudge />);
    expect(container).toBeEmptyDOMElement();
  });

  // Arayüz testi D-028: gönderim doğrulama İSTİYORSA (davetsiz ∧ bağlantısız
  // PUBLIC talep) yumuşak teşvik değil engelleyici kart — incelemedekine de.
  it("required + UNVERIFIED → engelleyici kart, doğrulama bağlantısı", () => {
    h.company = { companyVerificationStatus: "UNVERIFIED" };
    render(<VerifyNudge required />);
    expect(
      screen.getByRole("alert", { name: "Teklif göndermek için firma doğrulaması gerekir" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ücretsiz doğrulan" })).toHaveAttribute("href", "/company/ayarlar/dogrulama");
  });

  it("required + PENDING → inceleme metni, durum bağlantısı", () => {
    h.company = { companyVerificationStatus: "PENDING" };
    render(<VerifyNudge required />);
    expect(screen.getByText(/belgeleriniz inceleniyor/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Doğrulama durumu" })).toBeInTheDocument();
  });
});

// Yeniden doğrulama webC-01: dar ekranda düğme metnin yanına sıkışıp metni
// ~120px'lik sütuna kırmasın — metin sütunu asgari genişlik ister, düğme
// alt satıra iner (flex-wrap + basis).
describe("VerifyNudge — dar ekran yerleşimi", () => {
  it.each([true, false])("required=%s → metin sütunu asgari genişlikte, kart sarılır", (required) => {
    h.company = { companyVerificationStatus: "UNVERIFIED" };
    const { container } = render(<VerifyNudge required={required} />);
    const section = container.querySelector("section")!;
    expect(section.className).toContain("flex-wrap");
    const textCol = section.querySelector("div")!;
    expect(textCol.className).toContain("basis-56");
  });
});
