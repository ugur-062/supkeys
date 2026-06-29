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
import {
  useDeleteListingDoc,
  useListingDocuments,
  useUploadListingDoc,
} from "@/hooks/use-listing-documents";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
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
  const docs = useListingDocuments(listingId);
  const upload = useUploadListingDoc(listingId);
  const del = useDeleteListingDoc(listingId);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success("Dosya yüklendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yüklenemedi"));
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
            İhale kapandı — belgeler salt-okunur
          </Text>
        ) : null}
      </div>

      {docs.isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            {isOwner
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
                  {format(new Date(d.createdAt), "d MMM yyyy", { locale: tr })}
                </TableCell>
                <TableCell className="text-right">
                  {isOwner && canEdit && d.mine ? (
                    <button
                      type="button"
                      onClick={() => del.mutate(d.id)}
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
