"use client";

import { useTranslations } from "next-intl";
import { useEntityLabels, useUnitLabel } from "@/i18n/domain";

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
import { MoneyInputNumber } from "@/components/ui/money-input";
import { QUANTITY_DECIMALS } from "@rothern/shared";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useCatalogItems,
  useMarkCatalogUsed,
  type CatalogItem,
} from "@/hooks/use-company-items";

export interface PickedCatalogItem {
  catalogId: string;
  name: string;
  description: string | null;
  unit: string;
  unitCode: string | null;
  materialCode: string | null;
  quantity: number;
  targetPrice: number | null;
  /**
   * Ürünün kapak görseli — ilanın kapağı buradan TÜRER (backend: sahibin
   * seçtiği yoksa ilk kalemin ilk görseli). Serbest girilen kalemde boş.
   */
  images: string[];
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
  const t = useTranslations("web.panel.requests.catalogPickerDialog");
  const L = useEntityLabels();
  const unitLabel = useUnitLabel();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  // Modal kapalıyken ağ isteği atma.
  const list = useCatalogItems(debouncedQ, open);
  const markUsed = useMarkCatalogUsed();
  // Seçim kalemin KENDİSİNİ taşır: arama değişince liste değişse de önceki
  // aramada işaretlenen kalem eklenir (derin denetim S084 — eskiden yalnız o
  // anki sonuç süzülüyor, önceki seçimler sessizce düşüyordu).
  // `qty` boş/yarım yazımda `undefined` (0'a sıfırlanıp sonraki rakamın arkasına
  // eklenmesin — arayüz testi son tur S-BUY: "2.5" → 5).
  const [selected, setSelected] = useState<
    Record<string, { item: CatalogItem; qty: number | undefined }>
  >({});

  const items = list.data?.items ?? [];
  const selectedCount = useMemo(
    () => Object.keys(selected).length,
    [selected],
  );

  const toggle = (it: CatalogItem) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[it.id] != null) delete next[it.id];
      else next[it.id] = { item: it, qty: 1 };
      return next;
    });

  const apply = () => {
    const picked: PickedCatalogItem[] = Object.values(selected).map(({ item: it, qty }) => ({
      catalogId: it.id,
      name: it.name,
      description: it.description,
      unit: it.unit,
      unitCode: it.unitCode,
      materialCode: it.code,
      // Boşaltılan/0 miktar kalemi 0 ile eklemez (arayüz testi D-242): 1'e döner.
      quantity: qty != null && Number.isFinite(qty) && qty > 0 ? qty : 1,
      targetPrice: it.targetPrice == null ? null : Number(it.targetPrice),
      images: it.thumbnailUrl ? [it.thumbnailUrl] : [],
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
      <DialogTitle>{t("katalogdanKalemEkle")}</DialogTitle>
      <DialogBody className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <Input
            autoFocus
            className="pl-9"
            placeholder={t("kalemAdiStokKoduMarka")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t("katalogdaAra")}
          />
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
            <PackageSearch className="mx-auto size-6 text-zinc-400" aria-hidden />
            <p className="mt-2 text-sm text-zinc-600">
              {q
                ? t("aramanizlaEslesenKalemYok")
                : t("katalogunuzHenuzBosBirOlusturduktan", { entityLower: L.entityLower })}
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
                      aria-label={t("sec", { name: it.name })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {it.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {[
                          it.code,
                          it.brand,
                          unitLabel(it.unit, it.unitCode),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {isOn ? (
                      // Dilin ondalık biçimi (TR "2,5" / "1.500"); `type="number"`
                      // Türkçe tarayıcıda "2." ara durumunu boş döndürüyordu.
                      <MoneyInputNumber
                        maxDecimals={QUANTITY_DECIMALS}
                        className="!w-28"
                        aria-label={t("miktari", { name: it.name })}
                        value={selected[it.id]?.qty}
                        onChange={(v) =>
                          setSelected((prev) => ({
                            ...prev,
                            [it.id]: { item: it, qty: v },
                          }))
                        }
                        onBlur={() =>
                          setSelected((prev) => {
                            const cur = prev[it.id];
                            if (!cur || (cur.qty != null && cur.qty > 0)) return prev;
                            return { ...prev, [it.id]: { ...cur, qty: 1 } };
                          })
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
            {t("sonucListesiKisaltildiAramayiDaraltin")}
          </p>
        ) : null}
      </DialogBody>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button onClick={apply} disabled={selectedCount === 0}>
          {selectedCount > 0 ? t("kalemiEkle", { n: selectedCount }) : t("ekle")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
