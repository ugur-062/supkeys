"use client";

import { useTranslations } from "next-intl";
import { useEntityLabels } from "@/i18n/domain";
import { useListingDocKindFieldLabel, useListingDocKindLabel } from "@/components/tenders/use-listing-doc-kind-label";

import { Badge } from "@/components/catalyst/badge";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/catalyst/button";
import {
  LISTING_DOC_KINDS,
  type ListingDocKind,
} from "@/hooks/use-listing-documents";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * API'nin kabul ettiği belge türleri (`company-listing-documents.service`
 * ALLOWED_MIME ile birebir). Seçicideki "Tüm dosyalar" ile gelen başka tür
 * listeye EKLENMEZ — eskiden kabul ediliyor, hata ancak kayıtta "1 dosya
 * yüklenemedi" olarak çıkıyordu (arayüz testi D-093).
 */
export const LISTING_DOC_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

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
  const t = useTranslations("web.panel.requests.stagedDocuments");
  const L = useEntityLabels();
  // Belge bölümü adı tek sözlükten (FilesTab ile aynı; yoksa kod).
  const kindLabel = useListingDocKindLabel();
  const docKindFieldLabel = useListingDocKindFieldLabel();
  const [kind, setKind] = useState<ListingDocKind>("IDARI_SARTNAME");

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const next = [...docs];
    for (const file of files) {
      if (!LISTING_DOC_MIME_TYPES.includes(file.type)) {
        toast.error(t("dosyaTuruDesteklenmiyor", { name: file.name }));
        continue;
      }
      // 50MB ön-kontrolü — R2 PUT'ta patlamadan anlaşılır mesaj (FilesTab paritesi).
      if (file.size > 50 * 1024 * 1024) {
        toast.error(t("n50mbSiniriniAsiyor", { name: file.name }));
        continue;
      }
      if (next.some((d) => d.file.name === file.name && d.kind === kind)) {
        toast.info(t("zatenEkli", { name: file.name }));
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
    label: kindLabel(k),
    items: docs.filter((d) => d.kind === k),
  })).filter((g) => g.items.length > 0);

  return (
    // Telefonda çerçevesiz (mobil denetim 2026-10, g06-request-create#new1):
    // bölüm zaten numaralı bölümün kartında; kart içinde kart iki kez 20 px
    // dolgu yiyordu, RU 360'ta "Административная спецификация" seçicisi
    // (283 px) 248 px'lik içeriğe sığmayıp kartın kenarını aşıyordu.
    <section className="card p-5 max-sm:p-0 max-sm:shadow-none max-sm:ring-0 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
            <FileText className="h-4 w-4 text-zinc-700" />
          </div>
          <h3 className="font-semibold text-zinc-900">{L.docs}</h3>
          {docs.length > 0 ? <Badge color="zinc">{docs.length}</Badge> : null}
        </div>
        {/* Telefonda seçici satırın tamamını alır (uzun bölüm adı kırpılır,
            kartı aşmaz); dosya düğmesi altına iner. sm'den itibaren eski dizilim. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="staged-doc-kind">
            {docKindFieldLabel}
          </label>
          <SelectMenu
            id="staged-doc-kind"
            value={kind}
            onChange={(v) => setKind(v as ListingDocKind)}
            className="w-full min-w-0 sm:w-auto sm:min-w-44"
            options={LISTING_DOC_KINDS.map((k) => ({
              value: k,
              label: kindLabel(k),
            }))}
          />
          <Button as="label" outline>
            <Paperclip data-slot="icon" />
            {t("dosyaEkle")}
            <input
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
              aria-label={t("bolumuneDosyaEkle", { item: kindLabel(kind) })}
              onChange={addFiles}
            />
          </Button>
        </div>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {t("bolumSecipSartnameTeknikResim", { shortLower: L.shortLower })}
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
                    {/* Dosya adı sarar (telefonda kırpılınca hangi dosyanın
                        kaldırılacağı okunmuyordu — mobil denetim 2026-10 g06). */}
                    <span className="min-w-0 flex-1 text-sm font-medium text-zinc-900 wrap-anywhere">
                      {d.file.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-zinc-400">
                        {/* 1 MB altı KB ile — küçük dosya "0.0 MB" görünüyordu (D-093). */}
                        {d.file.size < 1024 * 1024
                          ? t("kb", { n: Math.max(1, Math.round(d.file.size / 1024)) })
                          : t("mb", { toFixed: (d.file.size / 1024 / 1024).toFixed(1) })}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAt(d)}
                        aria-label={t("dosyasiniKaldir", { name: d.file.name })}
                        // Dokunma alanı ~36 px (dolgu + eksi kenar boşluğu; yazı yerinde) — eskiden 51×16 px.
                        className="-mx-2 -my-2.5 inline-flex items-center gap-1 rounded-lg px-2 py-2.5 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("kaldir")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-zinc-400">
            {t("dosyalarKaydedilirkenTaslakVeyaYayin", { shortLower: L.shortLower })}
          </p>
        </div>
      )}
    </section>
  );
}
