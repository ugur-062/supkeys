// @vitest-environment jsdom
/**
 * VARLIK ADI SIZINTISI — regresyon (v2 denetimi, 2026-09-03).
 *
 * Sihirbaz metni YALNIZ `entityLabels()` sözlüğünden gelir; varlık adı tek
 * yerde değişir. Satış ilanı sihirbazı 2026-09-04'te kaldırıldı — sözlük tek
 * girdiye indi ama kural kalır (yeni bir varlık eklenirse kopya-yapıştır
 * sızıntısı yine buradan yakalanır). İki katman:
 *  1. KAYNAK taraması: sihirbaz dosyalarında sabit "Satın Alma Talebi"/"ihale"
 *     dizesi kalmaz.
 *  2. DOM: render edilen adımlarda "ihale"/"ilan" görünmez, sözlük adı görünür.
 */
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "@/lib/tenders/form-schema";
import { ENTITY_LABELS } from "@/lib/company/terms";

vi.mock("@/hooks/use-company-connections", () => ({
  useConnections: () => ({ data: [] }),
}));
/* SEO Parça 8: özet adımındaki "Arama görünürlüğü" kartı react-query hook'ları
   kullanır; burada sağlayıcı yok → hook'lar boş veriyle taklit edilir. */
vi.mock("@/hooks/use-categories", () => ({ useCategoriesByIds: () => ({ data: [] }) }));
vi.mock("@/hooks/use-company-profile", () => ({ useCompanyProfile: () => ({ data: null }) }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ company: null, user: null }) }));
vi.mock("@/hooks/use-ai-seo-enrich", () => ({ useAiSeoEnrich: () => ({ mutateAsync: vi.fn() }) }));


import { StagedDocuments } from "../staged-documents";

/* 2026-09-19: detaylı sihirbaz kaldırıldı — kaynak taraması kalan paylaşılan
   parçaları VE hızlı talep dosyalarını kapsar. */
const WIZARD_DIR = path.join(process.cwd(), "src/components/tenders/wizard");
const QUICK_DIR = path.join(process.cwd(), "src/components/tenders/quick");
/** Tanımlayıcılar (MODULE_LABELS.satinalma.ihalelerim) metin değil — nokta
 *  sonrası "ihale" sayılmaz; metinde sözcük boşluk/tırnak sonrası gelir. */
const FORBIDDEN = /satın alma talebi|satın alma talebin|(?<![.\w])ihale/i;

/** Yorumlar kod belgesi — sözcük orada kalabilir (CLAUDE.md); soyulur. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function Harness({
  values,
  children,
}: {
  values: Partial<TenderFormData>;
  children: React.ReactNode;
}) {
  const form = useForm<TenderFormData>({
    defaultValues: { ...DEFAULT_FORM_VALUES, ...values },
  });
  return <FormProvider {...form}>{children}</FormProvider>;
}

describe("varlık adı sızıntısı", () => {
  it("sözlük: girdilerde 'ihale' ve 'ilan' yok", () => {
    for (const v of Object.values(ENTITY_LABELS.satinalma)) {
      expect(v).not.toMatch(/(?<![.\w])ihale/i);
      expect(v).not.toMatch(/\bilan/i);
    }
  });

  it("sihirbaz kaynak dosyalarında sabit varlık adı dizesi yok (yalnız sözlük)", () => {
    const files = [WIZARD_DIR, QUICK_DIR].flatMap((dir) =>
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => path.join(dir, f)),
    );
    files.push(path.join(process.cwd(), "src/components/tenders/files-tab.tsx"));
    const offenders: string[] = [];
    for (const file of files) {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (FORBIDDEN.test(line)) offenders.push(`${path.basename(file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("render: dokümanlar bölümü 'ihale'/'ilan' demez, sözlük adını kullanır", () => {
    const { container } = render(
      <Harness values={{ title: "Çelik boru alımı" }}>
        <StagedDocuments docs={[]} onChange={vi.fn()} />
      </Harness>,
    );
    const text = `${container.textContent ?? ""} ${document.body.textContent ?? ""}`;
    expect(text).not.toMatch(/(?<![.\w])ihale/i);
    expect(text).not.toMatch(/\bilan/i);
    expect(text).toContain("Talep Dokümanları");
  });
});
