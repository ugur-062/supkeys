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
});
