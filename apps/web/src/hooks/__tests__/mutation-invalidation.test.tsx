// @vitest-environment jsdom
/**
 * Derin denetim LU-24: mutasyon sonrası bağımlı önbellekler tazelenir —
 *  · doğrulamaya gönderim → /me (Ayarlar hub rozeti store'dan okur),
 *  · mesaj gönderimi → birleşik kutunun ['company-msg-threads','all'] listesi,
 *  · sipariş durum mutasyonları → pano/aksiyon merkezi.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { post: h.post, get: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { useSubmitDocs } from "../use-company-docs";
import { MESSAGE_KEYS, useSendMessage } from "../use-company-messages";
import { useAcceptOrder, useCancelOrder, useShipOrder } from "../use-company-orders";

function setup<T>(hook: () => T) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(hook, { wrapper });
  const keys = () => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
  return { qc, result, keys };
}

beforeEach(() => {
  h.post.mockReset().mockResolvedValue({ data: { ok: true } });
});

describe("useSubmitDocs", () => {
  it("belge önbelleğiyle birlikte /me'yi düşürür (doğrulama rozeti)", async () => {
    const { result, keys } = setup(() => useSubmitDocs());
    await act(async () => {
      await result.current.mutateAsync({});
    });
    expect(keys()).toContain(JSON.stringify(["company-docs"]));
    expect(keys()).toContain(JSON.stringify(["company-auth", "me"]));
  });
});

describe("useSendMessage", () => {
  it("birleşik kutunun ('all') thread listesini de tazeler", async () => {
    const { qc, result } = setup(() => useSendMessage("satis", "c2"));
    // Birleşik kutu sorgusu önbellekte: gönderim sonrası geçersizleşmeli.
    qc.setQueryData(MESSAGE_KEYS.threads("all"), []);
    await act(async () => {
      await result.current.mutateAsync("merhaba");
    });
    expect(qc.getQueryState(MESSAGE_KEYS.threads("all"))?.isInvalidated).toBe(true);
  });
});

describe("sipariş durum mutasyonları", () => {
  it.each([
    ["accept", () => useAcceptOrder("o1"), {}],
    ["ship", () => useShipOrder("o1"), { invoiceNumber: "F-1" }],
    ["cancel", () => useCancelOrder("o1"), "x"],
  ] as const)("%s → sipariş + pano önbelleği", async (_n, hook, input) => {
    const { result, keys } = setup(hook as () => { mutateAsync: (i?: unknown) => Promise<unknown> });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(keys()).toContain(JSON.stringify(["company-orders"]));
    expect(keys()).toContain(JSON.stringify(["company-dashboard"]));
  });
});
