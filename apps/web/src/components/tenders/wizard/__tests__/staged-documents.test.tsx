// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.error, info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { StagedDocuments, type StagedListingDoc } from "../staged-documents";

function Harness() {
  const [docs, setDocs] = useState<StagedListingDoc[]>([]);
  return <StagedDocuments docs={docs} onChange={setDocs} />;
}

/** Arayüz testi D-093: izin verilmeyen tür eklenirken reddedilir; küçük dosya KB ile. */
describe("StagedDocuments", () => {
  it("izin verilmeyen dosya türü listeye eklenmez; küçük dosya boyutu KB gösterilir", () => {
    const { container } = render(<Harness />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const txt = new File(["merhaba"], "not.txt", { type: "text/plain" });
    const pdf = new File([new Uint8Array(3 * 1024)], "sartname.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [txt, pdf] } });
    expect(h.error).toHaveBeenCalledWith(expect.stringContaining("not.txt"));
    expect(screen.queryByText("not.txt")).toBeNull();
    expect(screen.getByText("sartname.pdf")).toBeInTheDocument();
    expect(screen.getByText("3 KB")).toBeInTheDocument();
  });
});

/**
 * Mobil denetim 2026-10 (g06-request-create#new1): RU 360'ta bölüm seçicisi
 * (283 px) kart içindeki karta sığmıyordu. Telefonda bölüm çerçevesiz, seçici
 * satırın tamamını alır ve kırpılır; sm'den itibaren eski dizilim.
 */
describe("StagedDocuments — telefon yerleşimi", () => {
  const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

  it("bölüm seçicisi telefonda tam genişlik + küçülebilir; kart çerçevesi yalnız sm'den itibaren", () => {
    const { container } = render(<Harness />);
    const button = container.querySelector("#staged-doc-kind") as HTMLElement;
    const wrapper = button.parentElement as HTMLElement;
    expect(cls(wrapper)).toEqual(expect.arrayContaining(["w-full", "min-w-0", "sm:w-auto", "sm:min-w-44"]));
    expect(cls(wrapper)).not.toContain("min-w-44");
    expect(cls(wrapper.parentElement)).toEqual(expect.arrayContaining(["w-full", "sm:w-auto"]));
    const section = container.querySelector("section") as HTMLElement;
    expect(cls(section)).toEqual(expect.arrayContaining(["card", "p-5", "max-sm:p-0", "max-sm:ring-0", "max-sm:shadow-none"]));
  });
});
