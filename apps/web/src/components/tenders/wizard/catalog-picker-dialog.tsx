"use client";

import { useMemo, useState } from "react";
import { Search, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/catalyst/checkbox";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useCatalogItems,
  useMarkCatalogUsed,
  type CatalogItem,
} from "@/hooks/use-company-items";
import { unitText } from "@/components/ui/unit-select";

export interface PickedCatalogItem {
  catalogId: string;
  name: string;
  description: string | null;
  unit: string;
  unitCode: string | null;
  materialCode: string | null;
  quantity: number;
  targetPrice: number | null;
}

/**
 * Katalogdan kalem seçimi (Faz 2).
 *
 * Bilinçli sade: tek arama kutusu + liste + satır içi miktar. Kategori ağacı,
 * filtre paneli, sayfalama kontrolü YOK — kullanıcı zaten aradığını yazıyor ve
 * sık kullandığı kalemler sunucuda en üstte sıralanıyor.
 *
 * Seçilen kalem ihaleye KOPYALANIR (FK kurulmaz): katalogdaki sonraki bir
 * düzeltme yayınlanmış ihaleyi geriye dönük değiştirmemeli.
 */
export function CatalogPickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (items: PickedCatalogItem[]) => void;
}) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  // Modal kapalıyken ağ isteği atma.
  const list = useCatalogItems(debouncedQ, open);
  const markUsed = useMarkCatalogUsed();
  const [selected, setSelected] = useState<Record<string, number>>({});

  const items = list.data?.items ?? [];
  const selectedCount = useMemo(
    () => Object.keys(selected).length,
    [selected],
  );

  const toggle = (it: CatalogItem) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[it.id] != null) delete next[it.id];
      else next[it.id] = 1;
      return next;
    });

  const apply = () => {
    const picked: PickedCatalogItem[] = items
      .filter((it) => selected[it.id] != null)
      .map((it) => ({
        catalogId: it.id,
        name: it.name,
        description: it.description,
        unit: it.unit,
        unitCode: it.unitCode,
        materialCode: it.code,
        quantity: selected[it.id] ?? 1,
        targetPrice: it.targetPrice == null ? null : Number(it.targetPrice),
      }));
    if (picked.length > 0) {
      onPick(picked);
      // Sıralama sinyali — en-iyi-çaba, başarısızlığı akışı kırmaz.
      markUsed.mutate(picked.map((p) => p.catalogId));
    }
    setSelected({});
    setQ("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Katalogdan Kalem Ekle</DialogTitle>
      <DialogBody className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Kalem adı, stok kodu, marka…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Katalogda ara"
          />
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
            <PackageSearch className="mx-auto size-6 text-zinc-400" aria-hidden />
            <p className="mt-2 text-sm text-zinc-600">
              {q
                ? "Aramanızla eşleşen kalem yok."
                : "Katalogunuz henüz boş. Bir ihale oluşturduktan sonra “Kalemleri kataloğa kaydet” ile doldurabilirsiniz."}
            </p>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-zinc-950/10">
            <ul className="divide-y divide-zinc-950/5">
              {items.map((it) => {
                const isOn = selected[it.id] != null;
                return (
                  <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox
                      checked={isOn}
                      onChange={() => toggle(it)}
                      aria-label={`${it.name} seç`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {it.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {[
                          it.code,
                          it.brand,
                          unitText(it.unitCode, it.unit),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {isOn ? (
                      <Input
                        type="number"
                        min={0.001}
                        step="any"
                        className="!w-28"
                        aria-label={`${it.name} miktarı`}
                        value={selected[it.id]}
                        onChange={(e) =>
                          setSelected((prev) => ({
                            ...prev,
                            [it.id]: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {list.data?.truncated ? (
          <p role="status" className="text-xs text-amber-700">
            Sonuç listesi kısaltıldı — aramayı daraltın.
          </p>
        ) : null}
      </DialogBody>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={apply} disabled={selectedCount === 0}>
          {selectedCount > 0 ? `${selectedCount} kalemi ekle` : "Ekle"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
