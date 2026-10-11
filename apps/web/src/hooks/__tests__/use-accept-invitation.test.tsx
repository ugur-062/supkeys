// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  bind: vi.fn(),
}));

vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post, get: h.get } }));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({}),
}));
vi.mock("@/lib/company-auth/tenant-storage", () => ({
  bindSessionOwner: h.bind,
  clearTenantSessionData: vi.fn(),
}));
vi.mock("@/i18n/runtime", () => ({ runtimeLocale: () => "tr" }));
vi.mock("@/i18n/href", () => ({ localizePath: (p: string) => p }));
vi.mock("next-intl", () => ({ useLocale: () => "tr" }));

import { useAcceptInvitation, useInvitationPreview } from "../use-company-auth";

const PREVIEW = { email: "yeni@firma.com", roles: ["SATISCI"], companyName: "Örnek AŞ", expiresAt: "2026-12-01" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ekip daveti kabulü (arayüz testi FX-00 D-003)", () => {
  it("kabulden sonra hâlâ açık olan önizleme yeniden çekilmez (\"zaten kabul edilmiş\" toast'ı çıkmaz)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["unrelated", "old-session"], { secret: 1 });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    h.get.mockResolvedValue({ data: PREVIEW });
    h.post.mockResolvedValue({ data: { user: { id: "u1" }, company: { id: "c1" } } });

    const { result, rerender } = renderHook(
      () => ({ preview: useInvitationPreview("tok"), accept: useAcceptInvitation("tok") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.preview.data).toEqual(PREVIEW));
    expect(h.get).toHaveBeenCalledTimes(1);
    // Önizleme kendi kartında hata gösterir → global toast kapalı.
    expect(h.get).toHaveBeenCalledWith("/company/invitations/tok", { skipErrorToast: true });

    await act(async () => {
      await result.current.accept.mutateAsync({
        firstName: "Ada",
        lastName: "Yılmaz",
        password: "Guclu!Parola9",
        termsAccepted: true,
        mediationAccepted: true,
        kvkkAccepted: true,
      });
    });
    rerender();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(h.bind).toHaveBeenCalledWith("u1");
    // Eski oturumun önbelleği temizlendi (D-348 hijyeni korunur) …
    expect(qc.getQueryData(["unrelated", "old-session"])).toBeUndefined();
    // … ama önizleme yerinde kaldı ve ikinci GET gitmedi.
    expect(result.current.preview.data).toEqual(PREVIEW);
    expect(result.current.preview.error).toBeNull();
    expect(h.get).toHaveBeenCalledTimes(1);
  });
});
