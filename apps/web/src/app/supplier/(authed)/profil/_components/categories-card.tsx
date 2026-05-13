"use client";

import { CategoryBadge } from "@/components/categories/category-badge";
import { SegmentOnlySelector } from "@/components/categories/segment-only-selector";
import { Button } from "@/components/ui/button";
import {
  useSupplierCategories,
  useUpdateSupplierCategories,
} from "@/hooks/use-supplier-profile";
import axios from "axios";
import { Loader2, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function CategoriesCard() {
  const { data: categories, isLoading } = useSupplierCategories();
  const updateMutation = useUpdateSupplierCategories();

  const [editing, setEditing] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);

  useEffect(() => {
    if (categories) {
      setDraftIds(categories.map((c) => c.id));
    }
  }, [categories]);

  if (isLoading) {
    return (
      <div className="card p-6 flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const list = categories ?? [];

  return (
    <div className="card p-6 md:p-7">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-display font-bold text-brand-900 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tedarik Kategorileriniz
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {list.length > 0
              ? `${list.length} kategori seçili`
              : "Henüz kategori seçmediniz"}
          </p>
        </div>
        {!editing ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraftIds(list.map((c) => c.id));
              setEditing(true);
            }}
          >
            Düzenle
          </Button>
        ) : null}
      </div>

      {!editing ? (
        list.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">
            İhalelerle daha iyi eşleşmeniz için kategori seçimi yapmanızı
            öneririz.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {list.map((c) => (
              <CategoryBadge
                key={c.id}
                category={{
                  nameTr: c.nameTr,
                  breadcrumb: c.breadcrumb,
                  segmentLetter: c.breadcrumb.split(".")[0]?.trim() || null,
                }}
              />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <SegmentOnlySelector
            value={draftIds}
            onChange={setDraftIds}
            maxSelection={10}
          />

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setDraftIds(list.map((c) => c.id));
              }}
              disabled={updateMutation.isPending}
            >
              İptal
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (draftIds.length === 0) {
                  toast.error("En az 1 kategori seçmelisiniz");
                  return;
                }
                try {
                  await updateMutation.mutateAsync({ categoryIds: draftIds });
                  toast.success("Kategorileriniz güncellendi");
                  setEditing(false);
                } catch (err) {
                  const msg =
                    axios.isAxiosError(err) &&
                    (err.response?.data as { message?: string } | undefined)
                      ?.message;
                  toast.error(msg || "Güncelleme başarısız");
                }
              }}
              disabled={updateMutation.isPending || draftIds.length === 0}
              loading={updateMutation.isPending}
            >
              Kaydet
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
