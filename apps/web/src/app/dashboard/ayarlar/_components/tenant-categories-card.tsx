"use client";

import { CategoryBadge } from "@/components/categories/category-badge";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { SegmentOnlyPicker } from "@/components/categories/segment-only-picker";
import { Button } from "@/components/ui/button";
import {
  useTenantCategories,
  useUpdateTenantCategories,
} from "@/hooks/use-tenant-categories";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Alıcı faaliyet kategorileri — görüntüle + düzenle. Ana (segment, ≤3) +
 * alt (sınırsız). Onboarding'deki seçimle aynı model; ihale eşleştirmesini besler.
 */
export function TenantCategoriesCard({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useTenantCategories();
  const update = useUpdateTenantCategories();

  const [editing, setEditing] = useState(false);
  const [mainDraft, setMainDraft] = useState<string[]>([]);
  const [subDraft, setSubDraft] = useState<string[]>([]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
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
    } catch {
      toast.error("Güncelleme başarısız");
    }
  };

  if (editing) {
    return (
      <div className="space-y-5">
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">
            Ana Kategoriler
          </p>
          <p className="mb-2 text-xs text-slate-500">
            En fazla 3 ana faaliyet alanı (segment). İlki ana kategoridir.
          </p>
          <SegmentOnlyPicker
            value={mainDraft}
            onChange={setMainDraft}
            maxSelection={3}
            placeholder="Ana kategori seç (en fazla 3)"
          />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">
            Alt Kategoriler
          </p>
          <p className="mb-2 text-xs text-slate-500">
            Satın aldığınız ürün/hizmet kategorileri (sınırsız).
          </p>
          <CategorySelectorButton
            value={subDraft}
            onChange={setSubDraft}
            mode="multi"
            maxSelection={999}
            placeholder="Alt kategori ekle"
            modalTitle="Alt Kategoriler"
            modalDescription="Satın aldığınız ürün/hizmet kategorilerini seçin (sınırsız)."
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            disabled={update.isPending}
          >
            İptal
          </Button>
          <Button size="sm" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-500">
          {main.length > 0
            ? `${main.length} ana${sub.length ? ` · ${sub.length} alt` : ""} kategori seçili`
            : "Henüz kategori seçmediniz"}
        </p>
        {canEdit ? (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            Düzenle
          </Button>
        ) : null}
      </div>

      {main.length === 0 && sub.length === 0 ? (
        <p className="text-sm text-slate-500">
          İhalelerle daha iyi eşleşmeniz için faaliyet kategorilerinizi seçin.
        </p>
      ) : (
        <div className="space-y-3">
          {main.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">
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
              <p className="mb-1.5 text-xs font-semibold text-slate-500">
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
      )}
    </div>
  );
}
