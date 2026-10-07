// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { FreePeriodNotice } from "../free-period-notice";

/**
 * Ücretsiz dönem bilgisi (kullanıcı kararı 2026-10-07): doğrulanmamış hesaba
 * kısa cümle + doğrulama eylemi; incelemede/red kendi kısa durumu; doğrulanmış
 * firmaya hiçbir şey. Paket adı hiçbir durumda yok.
 */
function setCompany(status: string | null) {
  useCompanyAuthStore.setState({
    company: status ? ({ id: "c1", name: "Firma", companyVerificationStatus: status } as never) : null,
  } as never);
}

describe("FreePeriodNotice", () => {
  beforeEach(() => setCompany(null));

  it("doğrulanmamış: kısa ücretsiz cümlesi + doğrulama sayfasına tek eylem", () => {
    setCompany("UNVERIFIED");
    render(<FreePeriodNotice />);
    const box = screen.getByTestId("free-period-notice");
    expect(box).toHaveTextContent("Rothern tamamen ücretsiz. Yalnızca firma doğrulamasıyla");
    expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    expect(box.textContent).not.toMatch(/silver|gold|paket|premium/i);
  });

  it("incelemede ve reddedilmiş: kendi kısa durumu ve eylemi", () => {
    setCompany("PENDING");
    const { unmount } = render(<FreePeriodNotice />);
    expect(screen.getByTestId("free-period-notice")).toHaveTextContent("Doğrulamanız inceleniyor");
    expect(screen.getByRole("link", { name: "Doğrulama durumunu gör" })).toBeInTheDocument();
    unmount();
    setCompany("REJECTED");
    render(<FreePeriodNotice />);
    expect(screen.getByRole("link", { name: "Yeniden başvurun" })).toBeInTheDocument();
  });

  it("doğrulanmış firmaya ve oturumsuz duruma çizilmez", () => {
    setCompany("VERIFIED");
    const { container, rerender } = render(<FreePeriodNotice />);
    expect(container).toBeEmptyDOMElement();
    setCompany(null);
    rerender(<FreePeriodNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
