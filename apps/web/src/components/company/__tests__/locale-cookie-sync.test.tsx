// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { LocaleCookieSync } from "../locale-cookie-sync";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function setUser(locale?: string) {
  useCompanyAuthStore.setState({
    user: { id: "u1", locale } as never,
    company: null,
  } as never);
}

describe("LocaleCookieSync", () => {
  beforeEach(() => {
    refresh.mockClear();
    document.cookie = "NEXT_LOCALE=; Max-Age=0; Path=/";
  });

  it("kayıtlı dil çerezden farklıysa çerezi yazar ve ağacı yeniler", () => {
    setUser("en");
    render(<LocaleCookieSync />);
    expect(document.cookie).toContain("NEXT_LOCALE=en");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("aynıysa hiçbir şey yapmaz (döngü yok)", () => {
    document.cookie = "NEXT_LOCALE=en; Path=/";
    setUser("en");
    render(<LocaleCookieSync />);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("eski anlık görüntüde dil yoksa dokunmaz", () => {
    setUser(undefined);
    render(<LocaleCookieSync />);
    expect(document.cookie).not.toContain("NEXT_LOCALE=");
    expect(refresh).not.toHaveBeenCalled();
  });
});
