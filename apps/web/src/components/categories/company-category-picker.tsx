"use client";

import {
  MAX_COMPANY_MAIN_CATEGORIES,
  MAX_COMPANY_SUB_CATEGORIES,
  categorySegment,
} from "@rothern/shared";
import { Layers, Plus, Tag, X as XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useCategoriesByIds, useRoots } from "@/hooks/use-categories";
import { SegmentOnlyModal } from "./segment-only-picker";

// Modal 1000+ satır — kullanıcı açana kadar bundle'a girmesin (P-4 kalıbı).
const CategorySelectorModal = dynamic(
  () => import("./category-selector-modal").then((m) => m.CategorySelectorModal),
  { ssr: false },
);

export interface CompanyCategoryValue {
  /** ANA kategori = segment (L1). Eşleştirmenin geniş ekseni. */
  mainIds: string[];
  /** ALT kategori (L2-4). Eşleştirmenin dar ekseni. */
  subIds: string[];
}

interface Props {
  value: CompanyCategoryValue;
  onChange: (next: CompanyCategoryValue) => void;
  /** Bölüm başlığı: "Ne satarım", "Ne alırım", "Faaliyet alanlarınız". */
  label: string;
  /** Başlığın altındaki tek cümlelik gerekçe. */
  hint: string;
  /** Modal başlığı — hangi eksende olduğumuzu modal içinde de söyler. */
  modalTitle: string;
  /** Portal rengi: satınalma mavi, satış yeşil, kayıt nötr. */
  accent?: "blue" | "emerald" | "zinc";
  disabled?: boolean;
  error?: string;
}

const ACCENT: Record<
  NonNullable<Props["accent"]>,
  { dot: string; chip: string }
> = {
  blue: { dot: "bg-blue-500", chip: "border-blue-200 bg-blue-50 text-blue-900" },
  emerald: {
    dot: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  zinc: { dot: "bg-zinc-400", chip: "border-zinc-300 bg-zinc-100 text-zinc-800" },
};

/**
 * FİRMA KATEGORİ BEYANI — TEK SORU, TÜRETİLMİŞ SEGMENT.
 *
 * ÖNCEKİ HÂLİ NEDEN DEĞİŞTİ (2026-09-14, kullanıcı: "frontendi hoş değil"):
 * ekran aynı Ariba ağacından İKİ KEZ seçim istiyordu — önce "Faaliyet Sektörü"
 * (yalnız L1, kendi modalı), sonra "Ürün / hizmetleriniz" (L3-4, başka bir
 * modal) — ve üçüncü bir kalıpla faaliyet tipi çipleri. Üç ayrı etkileşim
 * deseni, tek bir soru için.
 *
 * Kullanıcı ne sattığını bilir ("çelik boru"), onun Ariba segmentini bilmez.
 * Bu yüzden artık TEK seçim var: somut ürün/hizmet. Segment koddan TÜRETİLİR
 * (`categorySegment`, ilan tarafındaki `deriveCategoryMatchCandidates` ile aynı
 * mantık) ve salt-okunur rozet olarak gösterilir — kullanıcı ne beyan ettiğini
 * görür ama ikinci kez seçmez.
 *
 * SEGMENT NEDEN YİNE DE YAZILIYOR: eşleştirme iki eksene birden bakıyor
 * (`sellerCategoryIds hasSome segmentIds` OR `sellerSubCategoryIds hasSome
 * subCandidates`). Segment ekseni boş kalırsa firma yalnız tam kırılım
 * tutturan taleplerde görünür ve geniş talepleri kaçırır.
 *
 * KAÇIŞ YOLU: bir segmentin tamamında çalışan firma yaprak saymak zorunda
 * kalmasın diye "Sektör geneli ekle" duruyor. Bu yolla eklenen segmentin altı
 * boş kalır — bilinçli: "bu alanda her şeyi yaparım" beyanı.
 *
 * EKLE/ÇIKAR KURALI (belirsizlik bırakmamak için):
 *  · alt kategori eklenince segmenti KENDİLİĞİNDEN belirir
 *  · alt kategori silinince segment KALIR (daha geniş beyan, zarar vermez)
 *  · segment silinince ALTINDAKİLER DE gider (zincirleme) — "artık bu alanda
 *    değilim" demenin tek ve net yolu
 */
export function CompanyCategoryPicker({
  value,
  onChange,
  label,
  hint,
  modalTitle,
  accent = "zinc",
  disabled,
  error,
}: Props) {
  const [subOpen, setSubOpen] = useState(false);
  const [segmentOpen, setSegmentOpen] = useState(false);
  const [uyari, setUyari] = useState<string | null>(null);

  const { data: segments } = useRoots();
  const { data: subCats } = useCategoriesByIds(value.subIds);
  const renk = ACCENT[accent];

  const segmentAdi = useMemo(() => {
    const m = new Map((segments ?? []).map((s) => [s.id, s.nameTr]));
    return (id: string) => m.get(id) ?? id;
  }, [segments]);

  /** Segment → altındaki seçili yapraklar. Gösterim bu gruplamayla yapılır. */
  const gruplar = useMemo(() => {
    const adById = new Map((subCats ?? []).map((c) => [c.id, c.nameTr]));
    const map = new Map<string, { id: string; ad: string }[]>();
    for (const id of value.mainIds) map.set(id, []);
    for (const id of value.subIds) {
      const seg = categorySegment(id);
      if (!seg) continue;
      if (!map.has(seg)) map.set(seg, []);
      map.get(seg)!.push({ id, ad: adById.get(id) ?? "…" });
    }
    return [...map.entries()];
  }, [value.mainIds, value.subIds, subCats]);

  const bos = value.mainIds.length === 0 && value.subIds.length === 0;

  /** Alt kategori seçimi onaylandı — segmentleri türet, tavanı denetle. */
  const altOnayla = (ids: string[]) => {
    const turetilen = new Set(value.mainIds);
    for (const id of ids) {
      const seg = categorySegment(id);
      if (seg) turetilen.add(seg);
    }
    if (turetilen.size > MAX_COMPANY_MAIN_CATEGORIES) {
      // Sessizce kırpmak yerine söylüyoruz: hangi seçimin düştüğünü kullanıcı
      // göremezse beyanı eksik kalır ve bunu asla fark etmez.
      setUyari(
        `Seçimleriniz ${turetilen.size} ayrı sektöre yayılıyor; en fazla ${MAX_COMPANY_MAIN_CATEGORIES} sektör beyan edilebilir. Daha dar bir liste seçin.`,
      );
      return;
    }
    setUyari(null);
    onChange({ mainIds: [...turetilen], subIds: ids });
  };

  /**
   * Sektör geneli seçimi. Bu modal türetilmiş segmentleri de işaretli
   * gösterdiği için kullanıcı buradan bir segmenti KALDIRABİLİR — o zaman
   * altındaki yapraklar da gitmeli, yoksa segmenti olmayan öksüz alt kategori
   * kalır ve ekranda hiçbir grubun altında görünmez.
   */
  const segmentOnayla = (ids: string[]) => {
    const kalan = new Set(ids);
    setUyari(null);
    onChange({
      mainIds: ids,
      subIds: value.subIds.filter((id) => {
        const seg = categorySegment(id);
        return seg ? kalan.has(seg) : false;
      }),
    });
  };

  const altSil = (id: string) => {
    onChange({ ...value, subIds: value.subIds.filter((x) => x !== id) });
  };

  /** Segment silinince altındaki yapraklar da gider — zincirleme. */
  const segmentSil = (seg: string) => {
    onChange({
      mainIds: value.mainIds.filter((x) => x !== seg),
      subIds: value.subIds.filter((id) => categorySegment(id) !== seg),
    });
  };

  return (
    <div>
      <span className="block text-sm font-medium text-zinc-950">
        <span
          aria-hidden
          className={`mr-1.5 inline-block size-2 rounded-full align-middle ${renk.dot}`}
        />
        {label}
      </span>
      <p className="mt-0.5 mb-2 text-xs text-zinc-500">{hint}</p>

      {bos ? (
        <button
          type="button"
          onClick={() => !disabled && setSubOpen(true)}
          disabled={disabled}
          className={`flex w-full items-center justify-between rounded-lg border-2 border-dashed px-4 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? "border-rose-300 bg-rose-50 hover:bg-rose-100"
              : "border-zinc-300 bg-white hover:border-zinc-400"
          }`}
        >
          <span className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                error ? "bg-rose-100" : "bg-zinc-100"
              }`}
            >
              <Tag
                className={`h-4 w-4 ${error ? "text-rose-600" : "text-zinc-600"}`}
              />
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold text-zinc-900">
                Ürün / hizmet seçin
              </span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                Sektörünüz seçiminizden otomatik belirlenir
              </span>
            </span>
          </span>
          <Plus className="h-4 w-4 text-zinc-500" />
        </button>
      ) : (
        <ul className="space-y-2">
          {gruplar.map(([seg, yapraklar]) => (
            <li
              key={seg}
              className="rounded-lg border border-zinc-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${renk.chip}`}
                >
                  <Layers className="h-3 w-3" aria-hidden />
                  {segmentAdi(seg)}
                </span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => segmentSil(seg)}
                    aria-label={`${segmentAdi(seg)} sektörünü ve altındaki seçimleri kaldır`}
                    className="rounded p-0.5 text-zinc-500 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                  >
                    <XIcon className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              {yapraklar.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {yapraklar.map((y) => (
                    <span
                      key={y.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                    >
                      <span className="max-w-[220px] truncate">{y.ad}</span>
                      {!disabled ? (
                        <button
                          type="button"
                          onClick={() => altSil(y.id)}
                          aria-label={`${y.ad} seçimini kaldır`}
                          className="rounded text-zinc-500 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                        >
                          <XIcon className="h-3 w-3" aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
                  Sektörün tamamı — bu alandaki her talep size iletilir.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* Boşken birincil eylem zaten yukarıdaki kesikli kutu — burada
              tekrarlamak iki özdeş düğme bırakırdı. */}
          {!bos ? (
            <button
              type="button"
              onClick={() => setSubOpen(true)}
              className="flex items-center gap-1 text-sm font-semibold text-zinc-700 hover:text-zinc-900"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Ürün / hizmet ekle
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSegmentOpen(true)}
            className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
          >
            Sektör geneli ekle
          </button>
        </div>
      ) : null}

      {uyari ? (
        <p role="alert" className="mt-1.5 text-xs text-amber-700">
          {uyari}
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-rose-600">{error}</p> : null}

      {subOpen ? (
        <CategorySelectorModal
          isOpen={subOpen}
          onClose={() => setSubOpen(false)}
          value={value.subIds}
          onConfirm={altOnayla}
          mode="multi"
          maxSelection={MAX_COMPANY_SUB_CATEGORIES}
          title={modalTitle}
          description="Tam olarak ne alıp sattığınızı arayıp seçin. Sektörünüz bu seçimden otomatik çıkar."
          catalog="full"
        />
      ) : null}

      {/* Koşullu mount: modal gövdesi açılmadan koşarsa katalog sorgusunu
          kullanıcı hiç dokunmadan tetikler (P-4'te ölçülen tuzak). */}
      {segmentOpen ? (
        <SegmentOnlyModal
          isOpen
          onClose={() => setSegmentOpen(false)}
          value={value.mainIds}
          onConfirm={segmentOnayla}
          maxSelection={MAX_COMPANY_MAIN_CATEGORIES}
          title="Sektör geneli"
          description="Bir sektörün tamamında çalışıyorsanız buradan seçin. Alt kırılım seçmek daha isabetli eşleşme sağlar."
        />
      ) : null}
    </div>
  );
}
