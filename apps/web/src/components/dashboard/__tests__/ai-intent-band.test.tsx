// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSearchIntentResult } from "@rothern/shared";

const h = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
  usePathname: () => "/company/satinalma",
}));

import { AiIntentBand } from "../ai-intent-band";

const intent: AiSearchIntentResult = {
  portal: "satinalma",
  summary: "Anladığım: kompanzasyon panosu, İstanbul",
  query: "kompanzasyon panosu",
  category: { id: "39121500", nameTr: "Kompanzasyon panoları" },
  categoryHint: "kompanzasyon panosu",
  city: "İstanbul",
  verifiedOnly: false,
  activity: null,
  priceMax: null,
  currency: null,
  quantity: null,
  unit: null,
  keywords: [],
  draft: { draft: { title: "x" } as never, flags: [], missingRequired: [], route: "text", downgraded: false, warned: false },
  downgraded: false,
  warned: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.search = "q=kompanzasyon+panosu&kategori=39121500&sehir=%C4%B0stanbul&nitelik=a:b&sayfa=2";
  sessionStorage.clear();
});

describe("AiIntentBand", () => {
  it("özet + URL'deki çipler; çip kaldırınca URL'den düşer (kategoriyle nitelik ve sayfa da)", async () => {
    const user = userEvent.setup();
    render(<AiIntentBand intent={intent} onDismiss={() => {}} />);
    expect(screen.getByRole("status", { name: "AI arama yorumu" })).toHaveTextContent("Anladığım: kompanzasyon panosu, İstanbul");
    expect(screen.getByRole("button", { name: /Kategori: Kompanzasyon panoları/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Kategori: Kompanzasyon panoları/ }));
    expect(h.replace).toHaveBeenLastCalledWith("/company/satinalma?q=kompanzasyon+panosu&sehir=%C4%B0stanbul", { scroll: false });
  });

  it("'Bu tanımla talep aç' taslağı sessionStorage'a yazar ve sihirbaza gider; kapat çağrılır", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<AiIntentBand intent={intent} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Bu tanımla talep aç" }));
    expect(JSON.parse(sessionStorage.getItem("ai-tender-draft") ?? "null")).toMatchObject({ route: "text" });
    expect(h.push).toHaveBeenCalledWith("/company/satinalma/taleplerim/yeni?ai=1");
    await user.click(screen.getByRole("button", { name: "AI yorumunu kapat" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("satışta talep aç düğmesi YOK; bulunamayan kategori ipucu görünür", () => {
    h.search = "q=salt";
    render(<AiIntentBand intent={{ ...intent, portal: "satis", draft: null, category: null, categoryHint: "şalt malzemesi" }} onDismiss={() => {}} />);
    expect(screen.queryByRole("button", { name: "Bu tanımla talep aç" })).toBeNull();
    expect(screen.getByText(/Kategori bulunamadı/)).toHaveTextContent("şalt malzemesi");
  });
});
