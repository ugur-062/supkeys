"use client";

import { useCategorySearchTree } from "@/hooks/use-categories";
import { useMemo } from "react";

/**
 * KATEGORİ ÖNERİSİ — kalem adından, AI'sız (2026-09-09 v2).
 *
 * İlk kalemin adındaki en uzun 1-2 sözcükle discovery kataloğunda arar
 * (`search-tree`, TR-katlanmış, kök toleranslı); eşleşen L3/L4 düğümlerinden
 * en fazla 3 çip. Tıklayınca kategori seçilir — 158 bin kodda modal açmak
 * yerine tek dokunuş. AI (Silver+) varsa onun önerisi de aynı çipe düşer.
 */
export function CategorySuggest({ seedText, selected, onPick }: { seedText: string; selected: string[]; onPick: (id: string) => void }) {
  const words = useMemo(
    () =>
      seedText
        .toLocaleLowerCase("tr")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !/^\d+$/.test(w)),
    [seedText],
  );
  // Arama sorgusu: en uzun iki sözcük (ürün tipi genelde uzundur); SIRALAMA ise
  // tüm sözcüklerle — "dikişsiz" tek başına "Mini yakıtlı kazan"ı öne
  // çıkarıyordu, adında "boru" da geçen düğüm üste alınır.
  const q = useMemo(() => [...words].filter((w) => w.length >= 4).sort((a, b) => b.length - a.length).slice(0, 2).join(" "), [words]);
  const { data } = useCategorySearchTree(q, "discovery");
  const suggestions = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    for (const seg of data?.segments ?? []) {
      for (const fam of seg.families) {
        for (const cls of fam.classes) {
          if (cls.isMatch) out.push({ id: cls.id, name: cls.nameTr });
          for (const c of cls.commodities) if (c.isMatch) out.push({ id: c.id, name: c.nameTr });
        }
      }
    }
    const score = (name: string) => {
      const n = name.toLocaleLowerCase("tr");
      return words.reduce((acc, w) => acc + (n.includes(w) ? (w.length >= 5 ? 2 : 1) : 0), 0);
    };
    return out
      .filter((s) => !selected.includes(s.id))
      .map((s) => ({ ...s, score: score(s.name) }))
      .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
      .slice(0, 3);
  }, [data, selected, words]);

  if (!q || suggestions.length === 0) return null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
      Öneri:
      {suggestions.map((s) => (
        <button key={s.id} type="button" onClick={() => onPick(s.id)} className="rounded-md border border-dashed border-blue-300 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 hover:border-blue-600 hover:bg-blue-50">
          + {s.name}
        </button>
      ))}
    </p>
  );
}
