"use client";

import { useMemo, useState } from "react";
import {
  COMMON_UNIT_CODES,
  UNITS,
  UNIT_DIMENSION_LABELS,
  foldSearchText,
  getUnit,
  normalizeUnit,
  type UnitDimension,
} from "@rothern/shared";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/catalyst/select";
import { cn } from "@/lib/utils";

/**
 * Ölçü birimi seçici (Faz 1).
 *
 * Önce serbest metin bir `<Input placeholder="adet">` vardı; "adet/Adet/ADET/
 * ad/pcs" ayrı değerler oluyor, rapor gruplanamıyordu. Artık SEÇİLİYOR.
 *
 * Basit tutuldu — kullanıcıyı zorlaştırmamak için:
 *  · Tek bir açılır liste; en sık kullanılan 8 birim EN ÜSTTE, altında boyuta
 *    göre gruplu tam liste (29 birim). Ayrı bir modal/arama ekranı YOK.
 *  · Son seçenek "Listede yok…" → yanında küçük bir metin kutusu açılır.
 *    Liste bilinçli olarak KAPALI DEĞİL: kullanıcı listede olmayan bir birim
 *    yüzünden ihale açamaz hale gelmemeli. Bu durumda yalnız bir bilgi notu
 *    gösterilir (raporda gruplanamaz).
 *  · Eski kayıtlar serbest metin taşıyor; `normalizeUnit` ile tanınırsa liste
 *    otomatik o birimi seçili gösterir, tanınmazsa "listede yok" moduna düşer.
 */
const OTHER = "__other__";

export function UnitSelect({
  value,
  unitCode,
  onChange,
  id,
  hasError,
  disabled,
}: {
  /** Serbest metin birim (kaydedilen alan). */
  value: string;
  /** Kanonik kod; yoksa metinden türetilir. */
  unitCode?: string | null;
  /** Her değişimde ikisini birden verir. */
  onChange: (next: { unit: string; unitCode: string | null }) => void;
  id?: string;
  hasError?: boolean;
  disabled?: boolean;
}) {
  const resolved = unitCode ?? normalizeUnit(value);
  const [freeText, setFreeText] = useState(resolved ? "" : value);
  const isOther = !resolved;

  const grouped = useMemo(() => {
    const commons = COMMON_UNIT_CODES.map((c) => getUnit(c)!).filter(Boolean);
    const rest = new Map<UnitDimension, typeof UNITS[number][]>();
    for (const u of UNITS) {
      if ((COMMON_UNIT_CODES as readonly string[]).includes(u.code)) continue;
      const arr = rest.get(u.dimension) ?? [];
      arr.push(u);
      rest.set(u.dimension, arr);
    }
    return { commons, rest: [...rest.entries()] };
  }, []);

  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        disabled={disabled}
        value={isOther ? OTHER : resolved}
        aria-invalid={hasError || undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            onChange({ unit: freeText || "", unitCode: null });
            return;
          }
          const u = getUnit(v);
          // Serbest metin alanı da katalog adıyla senkron kalır: kayıt hem
          // koda hem okunur metne sahip olur (expand→contract gereği).
          onChange({ unit: u?.nameTr ?? v, unitCode: v });
        }}
      >
        <optgroup label="Sık kullanılan">
          {grouped.commons.map((u) => (
            <option key={u.code} value={u.code}>
              {u.nameTr}
            </option>
          ))}
        </optgroup>
        {grouped.rest.map(([dim, list]) => (
          <optgroup key={dim} label={UNIT_DIMENSION_LABELS[dim]}>
            {list.map((u) => (
              <option key={u.code} value={u.code}>
                {u.nameTr}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER}>Listede yok…</option>
      </Select>

      {isOther ? (
        <>
          <Input
            aria-label="Birim (listede yok)"
            placeholder="örn. bobin"
            value={freeText}
            disabled={disabled}
            hasError={hasError}
            onChange={(e) => {
              const t = e.target.value;
              setFreeText(t);
              // Kullanıcı bilinen bir birim yazarsa sessizce kodla — "kg"
              // yazan kişi listeden seçmiş gibi davransın.
              onChange({ unit: t, unitCode: normalizeUnit(t) });
            }}
          />
          <p className={cn("text-xs", "text-amber-700")}>
            Bu birim katalogda yok — raporlarda diğer birimlerle
            gruplanamayacak.
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Gösterim yardımcısı — tablo/özet satırlarında `unitCode ?? unit`. */
export function unitText(
  unitCode: string | null | undefined,
  unit: string | null | undefined,
): string {
  return getUnit(unitCode)?.nameTr ?? (unit?.trim() || "—");
}

/** Arama kutusu olmayan yerlerde kod→ad çözümü için (TR-katlanmış eşleşme). */
export function matchUnit(query: string): string | null {
  return normalizeUnit(foldSearchText(query));
}
