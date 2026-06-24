"use client";

// Madde 34 — İhale Şablonları liste sayfası. Şablonlar wizard'dan
// "Şablon Kaydet" ile oluşturulur; burada listelenir, başlatılır, silinir.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import {
  EmptyState,
  ListSkeleton,
  PageHeader,
  Pagination,
} from "@/components/list";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useDeleteTenderTemplate,
  useTenderTemplates,
} from "@/hooks/use-templates";
import { extractErrorMessage } from "@/lib/tenders/error";
import { usePagedList } from "@/lib/use-paged-list";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowLeft, FileStack, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export function TenderTemplatesView() {
  const { has } = usePermissions();
  const canEdit = has("templates:edit");
  const list = useTenderTemplates();
  const deleteMutation = useDeleteTenderTemplate();
  const paged = usePagedList(list.data ?? [], 10);

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `"${name}" şablonu silinecek. Bu işlem geri alınamaz. Devam edilsin mi?`,
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Şablon silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silme başarısız"));
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link
          href="/dashboard/sablonlar"
          className="hover:text-brand-700 hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Tüm Şablonlar
        </Link>
      </nav>

      <PageHeader
        title="İhale Şablonları"
        description="Tekrarlayan alımlarınızı kalemleri ve ayarlarıyla birlikte şablonlayın. Yeni ihale açarken bir şablondan başlayarak zaman kazanın. Şablonlar, ihale wizard'ında 'Şablon Kaydet' ile oluşturulur."
        action={
          canEdit ? (
            <Link href="/dashboard/ihaleler/yeni">
              <Button variant="primary">
                <Plus className="w-4 h-4" />
                Yeni İhale
              </Button>
            </Link>
          ) : null
        }
      />

      <section className="card p-5">
        <div>
          {list.isLoading ? (
            <ListSkeleton rows={3} />
          ) : !list.data || list.data.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="Henüz ihale şablonu yok"
              description="Bir ihale oluştururken son adımda 'Şablon Kaydet' butonuyla o ihaleyi şablonlayın; burada görünür."
            />
          ) : (
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-12">No</TableHeader>
                  <TableHeader>Şablon Adı</TableHeader>
                  <TableHeader>Oluşturan</TableHeader>
                  <TableHeader>Son Güncelleme</TableHeader>
                  <TableHeader className="text-right">İşlem</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {paged.pageItems.map((t, idx) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-zinc-500">
                      {(paged.page - 1) * paged.pageSize + idx + 1}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-zinc-900">
                        {t.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      {t.createdBy.firstName} {t.createdBy.lastName}
                      {t.isOwnedByMe ? (
                        <span className="text-zinc-400"> (Siz)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-zinc-600">
                      {format(new Date(t.updatedAt), "dd.MM.yyyy HH:mm", {
                        locale: tr,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/dashboard/ihaleler/yeni?template=${t.id}`}
                        >
                          <Button variant="secondary" size="sm">
                            Bu şablonla aç
                          </Button>
                        </Link>
                        {canEdit && t.isOwnedByMe ? (
                          <IconButton
                            tone="danger"
                            onClick={() => handleDelete(t.id, t.name)}
                            aria-label="Şablonu sil"
                            title="Şablonu sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </IconButton>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {paged.showPagination ? (
            <Pagination
              variant="bare"
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              pageSize={paged.pageSize}
              onPageChange={paged.setPage}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
