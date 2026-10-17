// @vitest-environment jsdom
/**
 * Mobil denetim fix3 r5-requests#new2: yeni talepteki `StagedDocuments` ile
 * düzenlemedeki `FilesTab` iki ayrı sözlük okuyordu; RU'da aynı seçici
 * "Прочее" / "Другое", "Приложение / Чертёж" / "Приложение / чертёж",
 * başlık "Документы запроса" / "Файлы: Запрос" diye ayrışıyordu. Artık tek
 * sözlük (`web.domain.listingDocKind`) ve aynı başlık (`L.docs`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { LISTING_DOC_KINDS } from "@/hooks/use-listing-documents";

const h = vi.hoisted(() => ({ get: vi.fn(async () => ({ data: [] as unknown[] })) }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { FilesTab } from "../files-tab";
import { StagedDocuments } from "../wizard/staged-documents";

const withQuery = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const MESSAGES = path.resolve(__dirname, "../../../../../../packages/i18n/src/messages");
type Tree = Record<string, unknown>;
const web = (locale: string) => JSON.parse(readFileSync(path.join(MESSAGES, locale, "web.json"), "utf8")) as Tree;
const at = (tree: Tree, keys: string[]): unknown =>
  keys.reduce<unknown>((node, k) => (node && typeof node === "object" ? (node as Tree)[k] : undefined), tree);

describe("talep belgesi bölüm adları — tek sözlük", () => {
  it("yeni talep (StagedDocuments) ve düzenleme (FilesTab) aynı başlığı ve aynı bölüm adını çizer", () => {
    const staged = render(<StagedDocuments docs={[]} onChange={() => {}} />);
    const stagedTitle = staged.container.querySelector("h3")?.textContent;
    const stagedInput = staged.container.querySelector('input[type="file"]')?.getAttribute("aria-label");
    staged.unmount();

    const files = withQuery(<FilesTab listingId="l1" isOwner canEdit />);
    const filesTitle = files.container.querySelector("h3")?.textContent;
    const filesInput = files.container.querySelector('input[type="file"]')?.getAttribute("aria-label");

    expect(stagedTitle).toBe("Talep Dokümanları");
    expect(filesTitle).toBe(stagedTitle);
    expect(filesInput).toBe(stagedInput);
    expect(screen.getByText("Talep Dokümanları")).toBeInTheDocument();
  });

  it("katalogda ikinci sözlük yok; her dilde her bölümün tek adı var", () => {
    for (const locale of ["tr", "en", "ru"]) {
      const tree = web(locale);
      expect(at(tree, ["panel", "requests", "filesTab", "docKind"])).toBeUndefined();
      expect(at(tree, ["panel", "requests", "filesTab", "dosyalari"])).toBeUndefined();
      const dict = at(tree, ["domain", "listingDocKind"]) as Record<string, string>;
      for (const kind of LISTING_DOC_KINDS) expect(dict[kind], `${locale} ${kind}`).toBeTruthy();
    }
  });

  it("bölüm seçicisinin görünmez etiketi de tek anahtardan (`web.domain.listingDocKindField`); RU iki ekranda aynı", () => {
    const staged = render(<StagedDocuments docs={[]} onChange={() => {}} />);
    const stagedLabel = staged.container.querySelector('label[for="staged-doc-kind"]')?.textContent;
    staged.unmount();
    const files = withQuery(<FilesTab listingId="l1" isOwner canEdit />);
    const filesLabel = files.container.querySelector('label[for="listing-doc-kind"]')?.textContent;
    expect(stagedLabel).toBe("Dosya bölümü");
    expect(filesLabel).toBe(stagedLabel);
    for (const locale of ["tr", "en", "ru"]) {
      const tree = web(locale);
      expect(at(tree, ["panel", "requests", "filesTab", "dosyaBolumu"]), locale).toBeUndefined();
      expect(at(tree, ["panel", "requests", "stagedDocuments", "dosyaBolumu"]), locale).toBeUndefined();
    }
    expect(at(web("ru"), ["domain", "listingDocKindField"])).toBe("Раздел для файла");
    expect(at(web("en"), ["domain", "listingDocKindField"])).toBe("File section");
  });

  it("RU / EN: eğik çizgiden sonra küçük harf (cümle düzeni), 'Diğer' RU'da 'Прочее'", () => {
    const ru = at(web("ru"), ["domain", "listingDocKind"]) as Record<string, string>;
    expect(ru.EK).toBe("Приложение / чертёж");
    expect(ru.NUMUNE).toBe("Образец / изображение");
    expect(ru.DIGER).toBe("Прочее");
    const en = at(web("en"), ["domain", "listingDocKind"]) as Record<string, string>;
    expect(en.EK).toBe("Attachment / drawing");
    expect(en.NUMUNE).toBe("Sample / image");
  });
});
