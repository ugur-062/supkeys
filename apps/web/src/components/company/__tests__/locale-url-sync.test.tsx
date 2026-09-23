// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { LocaleUrlSync } from "../locale-url-sync";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/company/satinalma",
  useSearchParams: () => new URLSearchParams("tab=1"),
}));

function setUser(locale?: string) {
  useCompanyAuthStore.setState({ user: { id: "u1", locale } as never, company: null } as never);
}

describe("LocaleUrlSync", () => {
  beforeEach(() => replace.mockClear());

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
});
