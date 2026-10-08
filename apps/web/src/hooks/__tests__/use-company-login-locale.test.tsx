// @vitest-environment jsdom
/**
 * Arayüz testi 2026-10 code-auth-6: başka dildeki sayfadan girişte depo YENİ
 * dili hemen alır. Eskiden `PATCH me { locale }` bekleniyor ama yanıtı
 * atılıyordu: form depoyu giriş yanıtındaki ESKİ dille dolduruyor,
 * `LocaleUrlSync` adresi önce eski dile, `/me` gelince yeniden yeni dile
 * çeviriyordu (arada eski dilde ekran, iki fazladan yeniden bağlanma).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  bind: vi.fn(),
  locale: "en",
}));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post, patch: h.patch, get: vi.fn() } }));
vi.mock("@/lib/company-auth/tenant-storage", () => ({
  bindSessionOwner: h.bind,
  clearTenantSessionData: vi.fn(),
}));
vi.mock("@/i18n/runtime", () => ({ runtimeLocale: () => h.locale }));
vi.mock("@/i18n/href", () => ({ localizePath: (p: string) => p }));
vi.mock("next-intl", () => ({ useLocale: () => h.locale }));

import { useCompanyLogin, useVerifyEmail } from "../use-company-auth";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const session = (locale: string) => ({
  data: { user: { id: "u1", locale }, company: { id: "c1" } },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.locale = "en";
  sessionStorage.clear();
});

describe("useCompanyLogin — sayfa dili hesaba yazılır ve yanıt yeni dille döner", () => {
  it("hesap tr, sayfa en: PATCH me { locale: en } → dönen kullanıcı `en` (depo eski dile hiç düşmez)", async () => {
    h.post.mockResolvedValue(session("tr"));
    h.patch.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useCompanyLogin(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ email: "a@b.com", password: "x" });
    });
    expect(h.patch).toHaveBeenCalledWith("/company-auth/me", { locale: "en" }, { skipErrorToast: true });
    expect((res as { user: { locale: string } }).user.locale).toBe("en");
    expect(h.bind).toHaveBeenCalledWith("u1");
  });

  it("dil yazılamadıysa giriş engellenmez; kullanıcı hesabın kayıtlı diliyle döner", async () => {
    h.post.mockResolvedValue(session("tr"));
    h.patch.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useCompanyLogin(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ email: "a@b.com", password: "x" });
    });
    expect((res as { user: { locale: string } }).user.locale).toBe("tr");
  });

  it("diller aynıysa ve 2FA adımında PATCH atılmaz", async () => {
    h.post.mockResolvedValueOnce(session("en"));
    const { result } = renderHook(() => useCompanyLogin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: "a@b.com", password: "x" });
    });
    h.post.mockResolvedValueOnce({ data: { twoFactorRequired: true, method: "email" } });
    await act(async () => {
      await result.current.mutateAsync({ email: "a@b.com", password: "x" });
    });
    expect(h.patch).not.toHaveBeenCalled();
  });

  it("oturum açılınca yarım kalmış kayıt taslağı kapanır", async () => {
    sessionStorage.setItem("rothern:signup-draft", JSON.stringify({ email: "a@b.com", verifyEmail: "a@b.com" }));
    h.post.mockResolvedValue(session("en"));
    const { result } = renderHook(() => useCompanyLogin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: "a@b.com", password: "x" });
    });
    expect(sessionStorage.getItem("rothern:signup-draft")).toBeNull();
  });
});

describe("useVerifyEmail — ilk doğrulama da aynı kural", () => {
  it("oturum dönerse dil eşitlenir ve yanıt yeni dille gelir; kayıt taslağı kapanır", async () => {
    h.locale = "ru";
    sessionStorage.setItem("rothern:signup-draft", JSON.stringify({ email: "a@b.com", verifyEmail: "a@b.com" }));
    h.post.mockResolvedValue(session("tr"));
    h.patch.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useVerifyEmail(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ email: "a@b.com", code: "123456" });
    });
    expect(h.patch).toHaveBeenCalledWith("/company-auth/me", { locale: "ru" }, { skipErrorToast: true });
    expect((res as { user: { locale: string } }).user.locale).toBe("ru");
    expect(sessionStorage.getItem("rothern:signup-draft")).toBeNull();
  });

  it("alreadyVerified: oturum yok → PATCH yok, taslak yine kapanır", async () => {
    sessionStorage.setItem("rothern:signup-draft", JSON.stringify({ email: "a@b.com", verifyEmail: "a@b.com" }));
    h.post.mockResolvedValue({ data: { alreadyVerified: true } });
    const { result } = renderHook(() => useVerifyEmail(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: "a@b.com", code: "123456" });
    });
    expect(h.patch).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("rothern:signup-draft")).toBeNull();
  });
});
