"use client";

import { Button } from "@/components/catalyst/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import {
  useDeleteListingDoc,
  useListingDocuments,
  useUploadListingDoc,
} from "@/hooks/use-listing-documents";
import { formatDate } from "@/lib/tenders/date";
import { extractErrorMessage } from "@/lib/tenders/error";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function FilesTab({
  listingId,
  isOwner,
  canEdit = false,
}: {
  listingId: string;
  isOwner: boolean;
  // İhale belgeleri yalnızca ilan düzenlenebilirken (TASLAK / teklifsiz AÇIK)
  // değiştirilebilir; kapandıktan sonra salt-okunur.
  canEdit?: boolean;
}) {
  const confirm = useConfirm();
  const docs = useListingDocuments(listingId);
  const upload = useUploadListingDoc(listingId);
  const del = useDeleteListingDoc(listingId);

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
      await upload.mutateAsync(file);
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

  return (
    <section className="rounded-2xl border border-zinc-950/5 bg-white p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
            <FileText className="h-4 w-4 text-zinc-700" />
          </div>
          <h3 className="font-semibold text-zinc-900">İhale Dosyaları</h3>
        </div>
        {isOwner && canEdit ? (
          <Button as="label" outline>
            <Paperclip data-slot="icon" />
            {upload.isPending ? "Yükleniyor…" : "Dosya Ekle"}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
              onChange={handleUpload}
              disabled={upload.isPending}
            />
          </Button>
        ) : isOwner ? (
          <Text className="text-xs text-zinc-400">
            Dosyalar Düzenle ekranından yönetilir
          </Text>
        ) : null}
      </div>

      {docs.isLoading ? (
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
              ? "Henüz dosya eklenmemiş. Şartname, teknik resim vb. ekleyebilirsin."
              : "Bu ihaleye dosya eklenmemiş."}
          </p>
        </div>
      ) : (
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Dosya</TableHeader>
              <TableHeader>Eklenme</TableHeader>
              <TableHeader className="text-right">İşlem</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {d.fileName}
                  </a>
                </TableCell>
                <TableCell className="text-zinc-500">
                  {formatDate(d.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {isOwner && canEdit && d.mine ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Sil
                    </button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
