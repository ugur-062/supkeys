// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resolve-api-url", () => ({ resolveApiBaseUrl: () => "https://api.test/api" }));

import { ViewBeacon } from "../view-beacon";

describe("ViewBeacon", () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    sessionStorage.clear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("3 sn okuma sonrası ÇEREZSİZ tek istek; aynı sekmede ikinci kez atılmaz", () => {
    const { unmount } = render(<ViewBeacon type="product" companySlug="firma-a" productSlug="urun-1" />);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/api/public/views");
    expect(init.credentials).toBe("omit");
    expect(JSON.parse(String(init.body))).toEqual({ type: "product", companySlug: "firma-a", productSlug: "urun-1" });
    unmount();
    render(<ViewBeacon type="product" companySlug="firma-a" productSlug="urun-1" />);
    vi.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("otomasyon (webdriver) ve gizli sekme sayılmaz; 3 sn'den önce ayrılınca istek yok", () => {
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    render(<ViewBeacon type="profile" companySlug="firma-a" />);
    vi.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    const { unmount } = render(<ViewBeacon type="profile" companySlug="firma-b" />);
    vi.advanceTimersByTime(1000);
    unmount();
    vi.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    render(<ViewBeacon type="profile" companySlug="firma-c" />);
    vi.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
