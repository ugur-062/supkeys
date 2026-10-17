// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { patch: h.patch, get: vi.fn() } }));

import { useUpdateUser } from "../use-company-users";

function setup() {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateUser(), { wrapper });
  const keys = () => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
  return { result, keys };
}

beforeEach(() => {
  h.patch.mockReset().mockResolvedValue({ data: { ok: true } });
});

describe("useUpdateUser (derin denetim MU-13 — devirden sonra eski Kurucunun /me'si)", () => {
  it("kuruculuk devri (roles SAHIP) eylemi yapanın /me önbelleğini de düşürür", async () => {
    const { result, keys } = setup();
    await act(async () => {
      await result.current.mutateAsync({ id: "u2", roles: ["SAHIP"], previousOwnerRoles: ["YONETICI"] });
    });
    expect(keys()).toContain(JSON.stringify(["company-auth", "me"]));
    expect(keys()).toContain(JSON.stringify(["company-users"]));
  });

  it("yalnız profil düzenlemesi /me'yi düşürmez", async () => {
    const { result, keys } = setup();
    await act(async () => {
      await result.current.mutateAsync({ id: "u2", firstName: "Ada" });
    });
    expect(keys()).not.toContain(JSON.stringify(["company-auth", "me"]));
    expect(keys()).toContain(JSON.stringify(["company-users"]));
  });
});
