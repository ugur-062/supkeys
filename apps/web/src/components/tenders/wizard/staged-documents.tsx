"use client";

import { Badge } from "@/components/catalyst/badge";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/catalyst/button";
import {
  LISTING_DOC_KINDS,
  LISTING_DOC_KIND_LABELS,
  type ListingDocKind,
} from "@/hooks/use-listing-documents";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Wizard'da ilan oluşmadan önce seçilen dosya — yayınla/taslakta yüklenir. */
export interface StagedListingDoc {
  file: File;
  kind: ListingDocKind;
}

/**
 * İhale dökümanı hazırlama (create modu) — FilesTab ile aynı görünüm, ama
 * dosyalar henüz yüklenmez: ilan kaydedilince (taslak/yayın) sırayla yüklenir.
 */
export function StagedDocuments({
  docs,
  onChange,
}: {
  docs: StagedListingDoc[];
  onChange: (docs: StagedListingDoc[]) => void;
}) {
  const [kind, setKind] = useState<ListingDocKind>("IDARI_SARTNAME");

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const next = [...docs];
    for (const file of files) {
      // 50MB ön-kontrolü — R2 PUT'ta patlamadan anlaşılır mesaj (FilesTab paritesi).
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`"${file.name}" 50MB sınırını aşıyor`);
        continue;
      }
      if (next.some((d) => d.file.name === file.name && d.kind === kind)) {
        toast.info(`"${file.name}" zaten ekli`);
        continue;
      }
      next.push({ file, kind });
    }
    onChange(next);
  };

  const removeAt = (target: StagedListingDoc) =>
    onChange(docs.filter((d) => d !== target));

  const grouped = LISTING_DOC_KINDS.map((k) => ({
    kind: k,
    label: LISTING_DOC_KIND_LABELS[k],
    items: docs.filter((d) => d.kind === k),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="rounded-2xl border border-zinc-950/5 bg-white p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
            <FileText className="h-4 w-4 text-zinc-700" />
          </div>
          <h3 className="font-semibold text-zinc-900">İhale Dökümanları</h3>
          {docs.length > 0 ? <Badge color="zinc">{docs.length}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="staged-doc-kind">
            Dosya bölümü
          </label>
          <SelectMenu
            id="staged-doc-kind"
            value={kind}
            onChange={(v) => setKind(v as ListingDocKind)}
            className="min-w-44"
            options={LISTING_DOC_KINDS.map((k) => ({
              value: k,
              label: LISTING_DOC_KIND_LABELS[k],
            }))}
          />
          <Button as="label" outline>
            <Paperclip data-slot="icon" />
            Dosya Ekle
            <input
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
              aria-label={`${LISTING_DOC_KIND_LABELS[kind]} bölümüne dosya ekle`}
              onChange={addFiles}
            />
          </Button>
        </div>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Bölüm seçip şartname, teknik resim vb. ekleyin — dosyalar ihale
          kaydedilirken (taslak veya yayın) yüklenir.
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.kind}>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="text-sm font-semibold text-zinc-800">
                  {g.label}
                </h4>
                <Badge color="zinc">{g.items.length}</Badge>
              </div>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
                {g.items.map((d, i) => (
                  <li
                    key={`${d.file.name}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-zinc-900">
                      {d.file.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-zinc-400">
                        {(d.file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAt(d)}
                        aria-label={`${d.file.name} dosyasını kaldır`}
                        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Kaldır
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-zinc-400">
            Dosyalar ihale kaydedilirken (taslak veya yayın) yüklenir.
          </p>
        </div>
      )}
    </section>
  );
}
