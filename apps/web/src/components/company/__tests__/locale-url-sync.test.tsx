// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { LocaleUrlSync } from "../locale-url-sync";

const replace = vi.fn();
let pathname = "/company/satinalma";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams("tab=1"),
}));

function setUser(locale?: string) {
  useCompanyAuthStore.setState({ user: { id: "u1", locale } as never, company: null } as never);
}

describe("LocaleUrlSync", () => {
  beforeEach(() => {
    replace.mockClear();
    pathname = "/company/satinalma";
  });

  it("kayıtlı dil adresteki dilden (tr) farklıysa aynı sayfayı o dilde açar", () => {
    setUser("en");
    render(<LocaleUrlSync />);
    expect(replace).toHaveBeenCalledWith("/company/satinalma?tab=1", { locale: "en" });
  });

  it("aynıysa hiçbir şey yapmaz (döngü yok)", () => {
    setUser("tr");
    render(<LocaleUrlSync />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("eski anlık görüntüde dil yoksa dokunmaz", () => {
    setUser(undefined);
    render(<LocaleUrlSync />);
    expect(replace).not.toHaveBeenCalled();
  });

  // Arayüz testi D-348: davet sayfası başka bir kişiye ait — açık kalmış başka
  // hesabın dili davetlinin dil seçimini geri almasın.
  it("token'lı davet sayfasında hesabın diline zorlamaz", () => {
    pathname = "/company/davet/abc123";
    setUser("en");
    render(<LocaleUrlSync />);
    expect(replace).not.toHaveBeenCalled();
  });
});
