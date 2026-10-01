import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * 404 sayfası (arayüz testi D-081): başlık "Sayfa bulunamadı", kök düzenin
 * `index, follow` yönergesi sıfırlanır (Next tek `noindex` basar) ve sayfa
 * site kabuğuyla (üst çubuk + altbilgi) sarılır.
 */
vi.mock("@/components/marketplace/public-layout", () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => <div data-testid="public-layout">{children}</div>,
}));

import NotFound, { generateMetadata } from "../not-found";

describe("[locale]/not-found", () => {
  it("meta: yerelleştirilmiş başlık, kök robots sıfırlanır", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "tr" }) });
    expect(meta.title).toBe("Sayfa bulunamadı");
    expect(meta).toHaveProperty("robots", null);
  });

  it("site kabuğu içinde çizilir", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain('data-testid="public-layout"');
    expect(html).toContain("Sayfa bulunamadı");
  });
});
