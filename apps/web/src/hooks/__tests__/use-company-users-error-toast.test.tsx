// @vitest-environment jsdom
/**
 * Arayüz testi webC-07 NEW-1 — Kullanıcıyı Düzenle'de yetki kaydı geçip kişi
 * bilgisi kaydı düşünce iki toast çıkıyordu: bileşenin bağlamlı mesajı
 * ("Yetkiler kaydedildi, ancak kişi bilgileri kaydedilemedi: …") ve global
 * companyApi 400 interceptor'ünün ham mesajı. Bu iki uç hatayı her zaman kendi
 * toast'unda gösteren tek çağırana hizmet eder → istek `skipErrorToast` taşır.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ put: vi.fn(), patch: vi.fn() }));

vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: vi.fn(), post: vi.fn(), put: h.put, patch: h.patch },
}));

import { useSetUserPermissions, useUpdateUser } from "../use-company-users";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  h.put.mockResolvedValue({ data: { ok: true, permissions: [], roles: [] } });
  h.patch.mockResolvedValue({ data: { ok: true } });
});

describe("Kullanıcıyı Düzenle istekleri global hata toast'unu kapatır (webC-07 NEW-1)", () => {
  it("yetki kaydı (PUT /permissions) skipErrorToast ile gider", async () => {
    const { result } = renderHook(() => useSetUserPermissions(), { wrapper });
    await act(() => result.current.mutateAsync({ id: "u1", permissions: ["buy:view"] }));
    expect(h.put).toHaveBeenCalledWith(
      "/company/users/u1/permissions",
      { permissions: ["buy:view"] },
      expect.objectContaining({ skipErrorToast: true }),
    );
  });

  it("kişi bilgisi kaydı (PATCH /company/users/:id) skipErrorToast ile gider", async () => {
    const { result } = renderHook(() => useUpdateUser(), { wrapper });
    await act(() => result.current.mutateAsync({ id: "u1", firstName: "Ayşe", phone: "" }));
    expect(h.patch).toHaveBeenCalledWith(
      "/company/users/u1",
      { firstName: "Ayşe", phone: "" },
      expect.objectContaining({ skipErrorToast: true }),
    );
  });
});
