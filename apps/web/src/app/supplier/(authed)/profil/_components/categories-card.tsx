"use client";

import { CategoryBadge } from "@/components/categories/category-badge";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { SegmentOnlyPicker } from "@/components/categories/segment-only-picker";
import { Button } from "@/components/catalyst/button";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  useSupplierCategories,
  useUpdateSupplierCategories,
} from "@/hooks/use-supplier-profile";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Tedarik kategorileri — ana (segment, ≤3) + alt (sınırsız). Onboarding'le aynı
 * model; ihale eşleştirme/öneri sistemini besler.
 */
export function CategoriesCard() {
  const { data, isLoading } = useSupplierCategories();
  const update = useUpdateSupplierCategories();

  const [editing, setEditing] = useState(false);
  const [mainDraft, setMainDraft] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState<string[]>([]);

  if (isLoading) {
    return (
      <section className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </section>
    );
  }

  const main = data?.main ?? [];
  const sub = data?.sub ?? [];

  const startEdit = () => {
    setMainDraft(main.map((c) => c.id));
    setSubDraft(sub.map((c) => c.id));
    setEditing(true);
  };

  const save = async () => {
    if (mainDraft.length < 1 || mainDraft.length > 3) {
      toast.error("1-3 arası ana kategori seçmelisiniz");
      return;
    }
    try {
      await update.mutateAsync({
        mainCategoryIds: mainDraft,
        subCategoryIds: subDraft,
      });
      toast.success("Kategorileriniz güncellendi");
      setEditing(false);
    } catch (err) {
      const msg =
        axios.isAxiosError(err) &&
        (err.response?.data as { message?: string } | undefined)?.message;
      toast.error(msg || "Güncelleme başarısız");
    }
  };

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Subheading>Tedarik Kategorileriniz</Subheading>
          <Text className="mt-1">
            {main.length > 0
              ? `${main.length} ana${sub.length ? ` · ${sub.length} alt` : ""} kategori seçili`
              : "Henüz kategori seçmediniz"}
          </Text>
        </div>
        {!editing ? (
          <Button outline onClick={startEdit}>
            Düzenle
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {!editing ? (
          main.length === 0 && sub.length === 0 ? (
            <Text>
              İhalelerle daha iyi eşleşmeniz için faaliyet kategorilerinizi seçin.
            </Text>
          ) : (
            <div className="space-y-3">
              {main.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-zinc-500">
                    Ana Kategoriler
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {main.map((c) => (
                      <CategoryBadge
                        key={c.id}
                        category={{ nameTr: c.nameTr, breadcrumb: c.breadcrumb }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              {sub.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-zinc-500">
                    Alt Kategoriler
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sub.map((c) => (
                      <CategoryBadge
                        key={c.id}
                        category={{ nameTr: c.nameTr, breadcrumb: c.breadcrumb }}
                        size="sm"
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )
        ) : (
          <div className="space-y-5">
            <div>
              <p className="mb-1 text-sm font-medium text-zinc-700">
                Ana Kategoriler
              </p>
              <p className="mb-2 text-xs text-zinc-500">
                En fazla 3 ana faaliyet alanınız (segment). İlki ana kategoridir.
              </p>
              <SegmentOnlyPicker
                value={mainDraft}
                onChange={setMainDraft}
                maxSelection={3}
                placeholder="Ana kategori seç (en fazla 3)"
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-zinc-700">
                Alt Kategoriler
              </p>
              <p className="mb-2 text-xs text-zinc-500">
                Teklif almak istediğiniz ürün/hizmet kategorileri (sınırsız).
              </p>
              <CategorySelectorButton
                value={subDraft}
                onChange={setSubDraft}
                mode="multi"
                maxSelection={999}
                placeholder="Alt kategori ekle"
                modalTitle="Alt Kategoriler"
                modalDescription="Ürün/hizmet kategorilerinizi seçin (sınırsız)."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                plain
                onClick={() => setEditing(false)}
                disabled={update.isPending}
              >
                İptal
              </Button>
              <Button onClick={save} disabled={update.isPending}>
                {update.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
