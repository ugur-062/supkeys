// @vitest-environment jsdom
/**
 * VARLIK ADI SIZINTISI — regresyon (v2 denetimi, 2026-09-03).
 *
 * Satış ilanı sihirbazı satın alma sihirbazının kopyasıydı ve varlık adı
 * değişmemişti ("Satış İlanı" ekranında "Satın Alma Talebi Adı"). İki katman:
 *  1. KAYNAK taraması: sihirbaz dosyalarında sabit "Satın Alma Talebi"/"ihale"
 *     dizesi kalmaz — metin YALNIZ `entityLabels()` sözlüğünden gelir.
 *  2. DOM: satış modunda render edilen adımlarda bu sözcükler görünmez.
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

import { Step0TypeScope } from "../step-0-type-scope";
import { Step4Review } from "../step-4-review";
import { PublishConfirmDialog } from "../publish-confirm-dialog";
import { StagedDocuments } from "../staged-documents";

const WIZARD_DIR = path.join(process.cwd(), "src/components/tenders/wizard");
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
  it("sözlük: satış girdilerinde 'satın alma'/'ihale' yok, satınalma girdilerinde 'ilan' yok", () => {
    for (const v of Object.values(ENTITY_LABELS.satis)) {
      expect(v).not.toMatch(FORBIDDEN);
    }
    for (const v of Object.values(ENTITY_LABELS.satinalma)) {
      expect(v).not.toMatch(/\bilan/i);
    }
  });

  it("sihirbaz kaynak dosyalarında sabit varlık adı dizesi yok (yalnız sözlük)", () => {
    const files = fs
      .readdirSync(WIZARD_DIR)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => path.join(WIZARD_DIR, f));
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

  it("SATIŞ modunda render: Kapsam + Özet + yayın onayı + dokümanlar 'Satın Alma Talebi'/'ihale' içermez", () => {
    const { container } = render(
      <Harness values={{ listingType: "SATIS", title: "Çelik boru satışı" }}>
        <Step0TypeScope />
        <Step4Review onEditStep={vi.fn()} stagedDocsCount={2} />
        <StagedDocuments docs={[]} onChange={vi.fn()} isSatis />
        <PublishConfirmDialog
          open
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          invitedCount={0}
          isSubmitting={false}
          isSatis
        />
      </Harness>,
    );
    const text = `${container.textContent ?? ""} ${document.body.textContent ?? ""}`;
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).toContain("Satış İlanı");
    expect(text).toContain("İlan Dokümanları");
  });

  it("SATINALMA modunda aynı adımlar 'ilan' demez", () => {
    const { container } = render(
      <Harness values={{ listingType: "ALIM", title: "Çelik boru alımı" }}>
        <Step0TypeScope />
        <Step4Review onEditStep={vi.fn()} stagedDocsCount={1} />
      </Harness>,
    );
    expect(container.textContent ?? "").not.toMatch(/\bilan/i);
    expect(container.textContent ?? "").toContain("Satın Alma Talebi");
  });
});
