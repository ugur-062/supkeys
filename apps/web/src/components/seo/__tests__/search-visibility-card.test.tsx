// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiSeoEnrichResult } from "@rothern/shared";
import { productSeoReadiness } from "@rothern/shared";
import { SearchVisibilityCard } from "../search-visibility-card";

const readiness = productSeoReadiness({ name: "Ürün", description: null, images: [], keywords: [], categoryId: null, attributeCount: 0 });
const snippet = { title: "Ürün — Firma · Rothern", description: "Fiyat için teklif isteyin", url: "https://www.rothern.com/firma/x/urun/y" };

describe("SearchVisibilityCard", () => {
  it("puan, eksikler (ipucuyla) ve parçacık önizlemesi", () => {
    render(<SearchVisibilityCard readiness={readiness} snippet={snippet} />);
    expect(screen.getByText(`%${readiness.score}`)).toBeInTheDocument();
    expect(screen.getByText("Google'da böyle görünür")).toBeInTheDocument();
    expect(screen.getByText(snippet.title)).toBeInTheDocument();
    // En değerli eksik ipucuyla birlikte
    expect(screen.getByText(/Açıklama en az 300 karakter/)).toBeInTheDocument();
    expect(screen.queryByText("AI ile açıklamayı güçlendir")).not.toBeInTheDocument();
  });

  it("'+N madde daha' tıklanınca kalan eksikler yerinde açılır, 'Daha az göster' kapatır", () => {
    render(<SearchVisibilityCard readiness={readiness} snippet={snippet} />);
    const total = readiness.missing.length;
    expect(total).toBeGreaterThan(4);
    const more = screen.getByRole("button", { name: `+${total - 4} madde daha` });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(readiness.missing[4].label, { exact: false })).toBeNull();
    fireEvent.click(more);
    for (const m of readiness.missing) expect(screen.getByText(m.label, { exact: false })).toBeInTheDocument();
    const less = screen.getByRole("button", { name: "Daha az göster" });
    expect(less).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(less);
    expect(screen.queryByText(readiness.missing[total - 1].label, { exact: false })).toBeNull();
  });

  it("AI: taslak önizlenir, 'Uygula' çağıranın apply'ını çalıştırır; pasifken gerekçe", async () => {
    const result: AiSeoEnrichResult = {
      description: "Uzun taslak açıklama.",
      keywords: ["a", "b"],
      titleSuggestion: "Daha iyi ad",
      missingFacts: ["ölçü"],
      downgraded: false,
      warned: false,
    };
    const run = vi.fn().mockResolvedValue(result);
    const apply = vi.fn();
    render(<SearchVisibilityCard readiness={readiness} snippet={snippet} enrich={{ run, apply, available: true }} />);
    fireEvent.click(screen.getByText("AI ile açıklamayı güçlendir"));
    await waitFor(() => expect(screen.getByText("Uzun taslak açıklama.")).toBeInTheDocument());
    expect(screen.getByText(/Daha iyi ad/)).toBeInTheDocument();
    expect(screen.getByText(/Ekleyebileceğiniz olgular/).parentElement).toHaveTextContent("ölçü");
    fireEvent.click(screen.getByText("Uygula"));
    expect(apply).toHaveBeenCalledWith(result);
    // Uygulandıktan sonra taslak kapanır, düğme geri gelir
    expect(screen.getByText("AI ile açıklamayı güçlendir")).toBeInTheDocument();

    render(
      <SearchVisibilityCard
        readiness={readiness}
        snippet={snippet}
        enrich={{ run, apply, available: false, unavailableReason: "Silver gerekir" }}
      />,
    );
    expect(screen.getAllByText("AI ile açıklamayı güçlendir").at(-1)).toBeDisabled();
    expect(screen.getByText("Silver gerekir")).toBeInTheDocument();
  });
});
