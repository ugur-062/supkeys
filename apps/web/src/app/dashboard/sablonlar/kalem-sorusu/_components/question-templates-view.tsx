"use client";

// V2-7+ — Kalem Sorusu Şablonları liste sayfası + yeni şablon modal'ı.

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
import { usePagedList } from "@/lib/use-paged-list";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useDeleteQuestionTemplate,
  useQuestionTemplates,
} from "@/hooks/use-templates";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowLeft,
  HelpCircle,
  Lock,
  Plus,
  Trash2,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { QuestionTemplateCreateDialog } from "./question-template-create-dialog";

export function QuestionTemplatesView() {
  const { has } = usePermissions();
  const canEdit = has("templates:edit");
  const list = useQuestionTemplates();
  const deleteMutation = useDeleteQuestionTemplate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
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
    <>
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
          title="Kalem Sorusu Şablonları"
          description="İhale oluştururken zamandan tasarruf edin! Bu ekranda, kalem sorusu şablonlarınızı oluşturabilirsiniz. Bu şablonlar, sıkça kullandığınız sorularınızı kaydetmenize ve gelecekteki işlemlerinizi hızlandırmanıza yardımcı olur."
          action={
            canEdit ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                Yeni Şablon Oluştur
              </Button>
            ) : null
          }
        />

        <section className="card p-5">
          <div>
            {list.isLoading ? (
              <ListSkeleton rows={3} />
            ) : !list.data || list.data.length === 0 ? (
              <EmptyState
                icon={HelpCircle}
                title="Henüz şablon eklenmemiş"
                description="Sık kullandığınız kalem sorularını kaydederek ihale hazırlığını hızlandırın."
              />
            ) : (
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader className="w-12">No</TableHeader>
                    <TableHeader>Şablon Adı</TableHeader>
                    <TableHeader className="text-center">Erişim</TableHeader>
                    <TableHeader className="text-center">Soru Sayısı</TableHeader>
                    <TableHeader>Şablon Sahibi</TableHeader>
                    <TableHeader>Son Güncelleme</TableHeader>
                    {canEdit ? (
                      <TableHeader className="w-12 text-right" />
                    ) : null}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.pageItems.map((t, idx) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-zinc-500">
                        {(paged.page - 1) * paged.pageSize + idx + 1}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setEditId(t.id)}
                          className="font-semibold text-zinc-900 hover:underline text-left"
                        >
                          {t.name}
                        </button>
                        {t.autoApply ? (
                          <span
                            className="ml-2 text-[10px] uppercase font-bold text-success-700 bg-success-50 px-1.5 py-0.5 rounded"
                            title="Yeni ihalelere otomatik eklenir"
                          >
                            Otomatik
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center">
                        {t.isPublic ? (
                          <span
                            className="inline-flex items-center text-zinc-600"
                            title="Herkese Açık"
                          >
                            <Users2 className="w-4 h-4" />
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center text-zinc-600"
                            title="Özel"
                          >
                            <Lock className="w-4 h-4" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{t.itemCount}</TableCell>
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
                      {canEdit ? (
                        <TableCell className="text-right">
                          {t.isOwnedByMe ? (
                            <IconButton
                              tone="danger"
                              onClick={() => handleDelete(t.id, t.name)}
                              aria-label="Şablonu sil"
                              title="Şablonu sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          ) : null}
                        </TableCell>
                      ) : null}
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

      <QuestionTemplateCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <QuestionTemplateCreateDialog
        key={editId ?? "none"}
        open={editId !== null}
        templateId={editId}
        onClose={() => setEditId(null)}
      />
    </>
  );
}
