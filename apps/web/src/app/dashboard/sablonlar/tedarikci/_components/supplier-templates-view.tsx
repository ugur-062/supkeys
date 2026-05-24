"use client";

// V2-7+ — Tedarikçi Şablonları liste sayfası + yeni şablon modal'ı.

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useDeleteSupplierTemplate,
  useSupplierTemplates,
} from "@/hooks/use-templates";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowLeft,
  Loader2,
  Lock,
  Plus,
  Trash2,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { SupplierTemplateCreateDialog } from "./supplier-template-create-dialog";

export function SupplierTemplatesView() {
  const { has } = usePermissions();
  const canEdit = has("templates:edit");
  const list = useSupplierTemplates();
  const deleteMutation = useDeleteSupplierTemplate();
  const [createOpen, setCreateOpen] = useState(false);

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

        <section className="card p-5">
          <header>
            <h1 className="font-display font-bold text-2xl text-brand-900">
              Tedarikçi Şablonları
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
              İhale oluştururken zamandan tasarruf edin! Bu şablonlar, sıkça
              tercih ettiğiniz tedarikçilerinizi kaydetmenize veya
              belirlediğiniz şekilde sınıflandırmanızı sağlayarak gelecekteki
              işlemlerinizi hızlandırır.
            </p>
          </header>

          {canEdit ? (
            <div className="mt-4">
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                Yeni Şablon Oluştur
              </Button>
            </div>
          ) : null}

          <div className="mt-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Tedarikçi Şablonları
            </h2>
            {list.isLoading ? (
              <div className="py-10 flex items-center justify-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : !list.data || list.data.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-500">
                Henüz şablon eklenmemiş.
              </p>
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
                        Firma Sayısı
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
                        <td className="px-3 py-3 font-semibold text-brand-700">
                          {t.name}
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
                        <td className="px-3 py-3 text-center">{t.memberCount}</td>
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

      <SupplierTemplateCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
