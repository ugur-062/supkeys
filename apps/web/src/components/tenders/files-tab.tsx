"use client";

import { Badge } from "@/components/catalyst/badge";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import {
  LISTING_DOC_KINDS,
  LISTING_DOC_KIND_LABELS,
  useDeleteListingDoc,
  useListingDocuments,
  useUploadListingDoc,
  type ListingDocKind,
} from "@/hooks/use-listing-documents";
import { formatDate } from "@/lib/tenders/date";
import { extractErrorMessage } from "@/lib/tenders/error";
import { FileText, Lock, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";
import { entityLabels } from "@/lib/company/terms";
import { toast } from "sonner";

export function FilesTab({
  listingId,
  isOwner,
  canEdit = false,
  masked = false,
}: {
  listingId: string;
  isOwner: boolean;
  // İhale belgeleri yalnızca ilan düzenlenebilirken (TASLAK / teklifsiz AÇIK)
  // değiştirilebilir; kapandıktan sonra salt-okunur.
  canEdit?: boolean;
  // Maskeli önizleme (standart + bağsız): şartname/dosyalar kilitli gösterilir.
  masked?: boolean;
}) {
  const L = entityLabels();
  const confirm = useConfirm();
  const docs = useListingDocuments(listingId, !masked);
  const upload = useUploadListingDoc(listingId);
  const del = useDeleteListingDoc(listingId);
  // Yükleme öncesi seçilen bölüm — dosya bu kategoriye kaydedilir.
  const [kind, setKind] = useState<ListingDocKind>("IDARI_SARTNAME");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // 50MB ön-kontrolü — R2 PUT'ta patlamadan anlaşılır mesaj.
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`"${file.name}" 50MB sınırını aşıyor`);
      return;
    }
    try {
      await upload.mutateAsync({ file, kind });
      toast.success("Dosya yüklendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yüklenemedi"));
    }
  };

  const handleDelete = async (docId: string) => {
    if (
      !(await confirm({
        title: "Dosyayı sil",
        description: "Dosya silinsin mi?",
        confirmLabel: "Sil",
        destructive: true,
      }))
    )
      return;
    try {
      await del.mutateAsync(docId);
      toast.success("Dosya silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  const rows = docs.data ?? [];
  // Bölümlere göre grupla; yalnızca dosyası olan bölümler gösterilir.
  const grouped = LISTING_DOC_KINDS.map((k) => ({
    kind: k,
    label: LISTING_DOC_KIND_LABELS[k],
    items: rows.filter((d) => d.kind === k),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="card p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
            <FileText className="h-4 w-4 text-zinc-700" />
          </div>
          <h3 className="font-semibold text-zinc-900">{L.entityShort} Dosyaları</h3>
        </div>
        {isOwner && canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="listing-doc-kind">
              Dosya bölümü
            </label>
            <SelectMenu
              id="listing-doc-kind"
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
              {upload.isPending ? "Yükleniyor…" : "Dosya Ekle"}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
                aria-label={`${LISTING_DOC_KIND_LABELS[kind]} bölümüne dosya ekle`}
                onChange={handleUpload}
                disabled={upload.isPending}
              />
            </Button>
          </div>
        ) : isOwner ? (
          <Text className="text-xs text-zinc-400">
            Dosyalar Düzenle ekranından yönetilir
          </Text>
        ) : null}
      </div>

      {masked ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Lock className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-sm font-semibold text-zinc-900">
            Şartname ve dosyalar kilitli
          </p>
          <p className="max-w-sm text-sm text-zinc-500">
            İhale dosyalarını (şartname, teknik resim vb.) görmek ve teklif
            vermek için <strong>premium</strong>&apos;a geçin ya da ilanı açan
            firmayla <strong>bağlantı</strong> kurun.
          </p>
        </div>
      ) : docs.isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : docs.isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Text className="text-sm text-red-600">Dosyalar yüklenemedi.</Text>
          <Button outline onClick={() => docs.refetch()}>
            Tekrar dene
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            {isOwner && canEdit
              ? "Henüz dosya eklenmemiş. Bölüm seçip Şartname, teknik resim vb. ekleyebilirsiniz."
              : `Bu ${L.dat} dosya eklenmemiş.`}
          </p>
        </div>
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
                {g.items.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-sm font-medium text-blue-600 hover:underline"
                    >
                      {d.fileName}
                    </a>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-zinc-400">
                        {formatDate(d.createdAt)}
                      </span>
                      {isOwner && canEdit && d.mine ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id)}
                          aria-label={`${d.fileName} dosyasını sil`}
                          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Sil
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
