"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useUnitLabel } from "@/i18n/domain";

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
 *  · "Listede yok" modu bileşenin KENDİ durumudur (derin denetim S086): yazarken
 *    kod VERİLMEZ (`unitCode: null`) — "teneke"nin ilk harfi "t" TON takma adına
 *    eşleşip kutuyu kapatıyordu. Bilinen birim eşlemesi yalnız alandan çıkınca
 *    ve metnin TAMAMI bir birim adıyla eşleşirse yapılır ("kg" → Kilogram).
 */
const OTHER = "__other__";

export function UnitSelect({
  value,
  unitCode,
  onChange,
  id,
  hasError,
  disabled,
  showHint = true,
  onFreeTextBlur,
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
  /**
   * "Katalogda yok" notu seçicinin altında mı çizilsin? Dar sütunda (kalem
   * satırı) not 6 satıra kırılıyordu (arayüz testi D-096) — çağıran
   * `false` verip notu tam genişlik satırda `UnitNotInCatalogHint` ile basar.
   */
  showHint?: boolean;
  /**
   * Serbest birim kutusundan çıkılınca (olası kodlamadan SONRA) çağrılır —
   * çağıran boş alanın hatasını burada gösterir. "Diğer…" seçilir seçilmez
   * boş kutuya "Birim zorunlu" basılmasın (arayüz testi webB-03 yeniden
   * doğrulama): hata yalnız alandan boş çıkılınca ya da kayıtta.
   */
  onFreeTextBlur?: () => void;
}) {
  const t = useTranslations("web.shared.unitSelect");
  // Boyut başlığı katalogdan (`web.domain.unitDimension.<KOD>`); yeni bir boyut
  // eklenirse paylaşılan Türkçe sözlüğe düşer.
  const td = useTranslations("web.domain.unitDimension");
  const unitLabel = useUnitLabel();
  const resolved = unitCode ?? normalizeUnit(value);
  const [freeText, setFreeText] = useState(resolved ? "" : value);
  const [otherMode, setOtherMode] = useState(!resolved);
  const isOther = otherMode || !resolved;
  // "Diğer…" kullanıcı seçimiyle açılınca boş kutu odak alır (yazmaya hazır);
  // ilk çizimde/eski kayıtta odak çalınmaz.
  const freeTextRef = useRef<HTMLInputElement>(null);
  const focusFreeText = useRef(false);
  useEffect(() => {
    if (!isOther || !focusFreeText.current) return;
    focusFreeText.current = false;
    freeTextRef.current?.focus();
  }, [isOther]);
  // Dışarıdan gelen değişiklik (satır sıfırlama, katalogdan kalem) modu yeniden
  // türetir; bileşenin kendi yazdığı değer türetmez (yoksa ilk harf yine kilitler).
  const emitted = useRef<string | null>(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const r = unitCode ?? normalizeUnit(value);
    setOtherMode(!r);
    setFreeText(r ? "" : value);
  }, [value, unitCode]);
  const emit = (next: { unit: string; unitCode: string | null }) => {
    emitted.current = next.unit;
    onChange(next);
  };

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
            focusFreeText.current = true;
            setOtherMode(true);
            emit({ unit: freeText || "", unitCode: null });
            return;
          }
          const u = getUnit(v);
          setOtherMode(false);
          // Serbest metin alanı da katalog adıyla senkron kalır: kayıt hem
          // koda hem okunur metne sahip olur (expand→contract gereği).
          emit({ unit: u?.nameTr ?? v, unitCode: v });
        }}
      >
        <optgroup label={t("sikKullanilan")}>
          {grouped.commons.map((u) => (
            <option key={u.code} value={u.code}>
              {unitLabel(u.nameTr, u.code)}
            </option>
          ))}
        </optgroup>
        {grouped.rest.map(([dim, list]) => (
          <optgroup
            key={dim}
            label={td.has(dim as never) ? td(dim as never) : UNIT_DIMENSION_LABELS[dim]}
          >
            {list.map((u) => (
              <option key={u.code} value={u.code}>
                {unitLabel(u.nameTr, u.code)}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER}>{t("listedeYok")}</option>
      </Select>

      {isOther ? (
        <>
          <Input
            ref={freeTextRef}
            aria-label={t("birimListedeYok")}
            placeholder={t("ornBobin")}
            value={freeText}
            disabled={disabled}
            hasError={hasError}
            onChange={(e) => {
              const t = e.target.value;
              setFreeText(t);
              // Yazarken kodlama YOK — ilk harf ("t", "g", "л") bir birimin
              // takma adına eşleşip kutuyu kapatıyordu.
              emit({ unit: t, unitCode: null });
            }}
            onBlur={() => {
              // Bilinen bir birim TAM yazıldıysa ("kg") listeden seçilmiş gibi kodla.
              const code = normalizeUnit(freeText);
              const u = code ? getUnit(code) : null;
              if (u) {
                setOtherMode(false);
                setFreeText("");
                emit({ unit: u.nameTr, unitCode: u.code });
              }
              onFreeTextBlur?.();
            }}
          />
          {showHint ? <UnitNotInCatalogHint /> : null}
        </>
      ) : null}
    </div>
  );
}

/** "Bu birim katalogda yok" notu — seçici dışında tam genişlik çizmek için. */
export function UnitNotInCatalogHint({ className }: { className?: string }) {
  const t = useTranslations("web.shared.unitSelect");
  return <p className={cn("text-xs text-amber-700", className)}>{t("buBirimKatalogdaYok")}</p>;
}

/** Kalem satırı notu için: seçici "listede yok" modunda mı (kod yok, metin tanınmıyor)? */
export function isUnitNotInCatalog(unit: string | null | undefined, unitCode: string | null | undefined): boolean {
  return !(unitCode ?? normalizeUnit(unit ?? ""));
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
