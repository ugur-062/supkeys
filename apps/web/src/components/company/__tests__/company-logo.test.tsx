// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyLogo } from "../company-logo";

/**
 * Kırık logo yedeğe düşer — hidrasyondan ÖNCE hata veren (SSR'lı profil)
 * görsel de dahil (derin denetim S066).
 */
function stubImage(complete: boolean, naturalWidth: number) {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(complete);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(naturalWidth);
}

afterEach(() => vi.restoreAllMocks());

describe("CompanyLogo", () => {
  it("onError ile yedeğe düşer", () => {
    stubImage(false, 0);
    render(<CompanyLogo src="/l.png" alt="X logosu" className="" fallback={<span>XY</span>} />);
    fireEvent.error(screen.getByAltText("X logosu"));
    expect(screen.getByText("XY")).toBeInTheDocument();
  });

  it("bağlanmadan önce kırılmış (complete + naturalWidth 0) görselde yedeğe düşer", () => {
    stubImage(true, 0);
    render(<CompanyLogo src="/l.png" alt="X logosu" className="" fallback={<span>XY</span>} />);
    expect(screen.queryByAltText("X logosu")).toBeNull();
    expect(screen.getByText("XY")).toBeInTheDocument();
  });

  it("yüklenmiş görsel yerinde kalır", () => {
    stubImage(true, 120);
    render(<CompanyLogo src="/l.png" alt="X logosu" className="" fallback={<span>XY</span>} />);
    expect(screen.getByAltText("X logosu")).toBeInTheDocument();
    expect(screen.queryByText("XY")).toBeNull();
  });
});
