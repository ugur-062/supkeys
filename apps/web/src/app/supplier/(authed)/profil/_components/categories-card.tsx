"use client";

import { CategoryBadge } from "@/components/categories/category-badge";
import { SegmentOnlySelector } from "@/components/categories/segment-only-selector";
import { Button } from "@/components/catalyst/button";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  useSupplierCategories,
  useUpdateSupplierCategories,
} from "@/hooks/use-supplier-profile";
import axios from "axios";
import { Loader2 } from "lucide-react";
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
      <section className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </section>
    );
  }

  const list = categories ?? [];

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Subheading>Tedarik Kategorileriniz</Subheading>
          <Text className="mt-1">
            {list.length > 0
              ? `${list.length} kategori seçili`
              : "Henüz kategori seçmediniz"}
          </Text>
        </div>
        {!editing ? (
          <Button
            outline
            onClick={() => {
              setDraftIds(list.map((c) => c.id));
              setEditing(true);
            }}
          >
            Düzenle
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {!editing ? (
          list.length === 0 ? (
            <Text>
              İhalelerle daha iyi eşleşmeniz için kategori seçimi yapmanızı
              öneririz.
            </Text>
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
          <div className="space-y-4">
            <SegmentOnlySelector
              value={draftIds}
              onChange={setDraftIds}
              maxSelection={10}
            />

            <div className="flex justify-end gap-2">
              <Button
                plain
                onClick={() => {
                  setEditing(false);
                  setDraftIds(list.map((c) => c.id));
                }}
                disabled={updateMutation.isPending}
              >
                İptal
              </Button>
              <Button
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
              >
                Kaydet
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
