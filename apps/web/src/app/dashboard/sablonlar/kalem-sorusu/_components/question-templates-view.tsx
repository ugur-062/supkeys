"use client";

// V2-7+ — Kalem Sorusu Şablonları liste sayfası + yeni şablon modal'ı.

import { EmptyState, ListSkeleton, PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold w-12">
                        No
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Şablon Adı
                      </th>
                      <th className="px-3 py-2 text-center font-semibold">
                        Erişim
                      </th>
                      <th className="px-3 py-2 text-center font-semibold">
                        Soru Sayısı
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Şablon Sahibi
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Son Güncelleme
                      </th>
                      {canEdit ? (
                        <th className="px-3 py-2 text-right font-semibold w-12">
                          {" "}
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((t, idx) => (
                      <tr
                        key={t.id}
                        className="border-t border-surface-border hover:bg-slate-50/40"
                      >
                        <td className="px-3 py-3 text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setEditId(t.id)}
                            className="font-semibold text-brand-700 hover:underline text-left"
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
                        </td>
                        <td className="px-3 py-3 text-center">
                          {t.isPublic ? (
                            <span
                              className="inline-flex items-center text-slate-600"
                              title="Herkese Açık"
                            >
                              <Users2 className="w-4 h-4" />
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center text-slate-600"
                              title="Özel"
                            >
                              <Lock className="w-4 h-4" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">{t.itemCount}</td>
                        <td className="px-3 py-3">
                          {t.createdBy.firstName} {t.createdBy.lastName}
                          {t.isOwnedByMe ? (
                            <span className="text-slate-400"> (Siz)</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {format(new Date(t.updatedAt), "dd.MM.yyyy HH:mm", {
                            locale: tr,
                          })}
                        </td>
                        {canEdit ? (
                          <td className="px-3 py-3 text-right">
                            {t.isOwnedByMe ? (
                              <button
                                type="button"
                                onClick={() => handleDelete(t.id, t.name)}
                                className="text-slate-400 hover:text-danger-600 transition-colors p-1"
                                title="Şablonu sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
