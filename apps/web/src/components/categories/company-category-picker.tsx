"use client";

import { useTranslations } from "next-intl";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  MAX_COMPANY_SUB_PICKS,
  categorySegment,
  deepestCategoryPicks,
  expandCompanyCategorySelection,
  removeCategoryBranch,
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
 *  · seçim eklenince ata zinciri (L2/L3/L4) ve segmenti KENDİLİĞİNDEN belirir
 *  · seçim silinince zinciri de gider; o segmentte başka seçim kalmadıysa
 *    SEGMENT DE düşer — aksi hâlde firma tek yaprağı sildikten sonra sessizce
 *    segmentin TAMAMINDAN bildirim almaya başlardı (çözmeye çalıştığımız
 *    arızanın ta kendisi)
 *  · segment silinince ALTINDAKİLER DE gider (zincirleme) — "artık bu alanda
 *    değilim" demenin tek ve net yolu
 *
 * BİLİNÇLİ TAVİZ: "Sektör geneli" ile eklenmiş bir segmentin altına sonradan
 * yaprak seçilir ve o yaprak silinirse, segment de düşer (kaydı provenance
 * tutmuyoruz). Tek tık ile geri eklenebilir; ters tercih ise sessiz genişleme
 * üretirdi.
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
  const t = useTranslations("web.shared.companyCategoryPicker");
  const [subOpen, setSubOpen] = useState(false);
  const [segmentOpen, setSegmentOpen] = useState(false);
  const [uyari, setUyari] = useState<string | null>(null);

  const { data: segments } = useRoots();
  /**
   * Depoda ata zinciri de duruyor (L2+L3+L4). Ekranda yalnız KULLANICININ
   * seçtikleri çizilir — türetilmiş üst seviyeler ayrı çip olsaydı tek seçim
   * üç çipe dönüşür ve 50'lik tavan anlamsızlaşırdı. Zincir, çipin
   * breadcrumb'ında zaten okunuyor.
   */
  const secilenler = useMemo(
    () => deepestCategoryPicks(value.subIds),
    [value.subIds],
  );
  const { data: subCats } = useCategoriesByIds(secilenler);
  const renk = ACCENT[accent];

  const segmentAdi = useMemo(() => {
    const m = new Map((segments ?? []).map((s) => [s.id, s.nameTr]));
    return (id: string) => m.get(id) ?? id;
  }, [segments]);

  /** Segment → kullanıcının o segmentte seçtikleri (yol bilgisiyle). */
  const gruplar = useMemo(() => {
    const byId = new Map((subCats ?? []).map((c) => [c.id, c]));
    const map = new Map<string, { id: string; ad: string; yol: string }[]>();
    for (const id of value.mainIds) map.set(id, []);
    for (const id of secilenler) {
      const seg = categorySegment(id);
      if (!seg) continue;
      if (!map.has(seg)) map.set(seg, []);
      const c = byId.get(id);
      map.get(seg)!.push({
        id,
        ad: c?.nameTr ?? "…",
        // Breadcrumb: zincirin tamamı burada okunuyor, ayrı çipe gerek yok.
        yol: c?.breadcrumb ?? "",
      });
    }
    return [...map.entries()];
  }, [value.mainIds, secilenler, subCats]);

  const bos = value.mainIds.length === 0 && value.subIds.length === 0;

  /**
   * Seçim onaylandı. Kullanıcı L4'e kadar inebilir; ata zinciri (L2+L3+L4)
   * beyana DAHİL edilir, segment ayrı eksene yazılır.
   *
   * Zincir neden şart: eşleştirme ata zincirini TALEBİN kodundan yukarı
   * çıkarıyor, firmanın beyanından aşağı inmiyor. Yaprak tek başına
   * saklansaydı, alıcı bir üst seviyede (L3) talep açtığında dar eksen tutmaz
   * ve firma geniş eksene düşerdi — yani daralttığını sanırken segmentin
   * tamamından bildirim alırdı.
   */
  const altOnayla = (ids: string[]) => {
    if (ids.length > MAX_COMPANY_SUB_PICKS) {
      setUyari(t("enFazlaUrunHizmetSecebilirsiniz", { max: MAX_COMPANY_SUB_PICKS }));
      return;
    }
    const { mainIds, subIds } = expandCompanyCategorySelection(
      ids,
      // "Sektör geneli" ile eklenmiş, altında seçim olmayan segmentler korunur.
      value.mainIds.filter(
        (m) => !value.subIds.some((s) => categorySegment(s) === m),
      ),
    );
    if (mainIds.length > MAX_COMPANY_MAIN_CATEGORIES) {
      // Sessizce kırpmak yerine söylüyoruz: hangi seçimin düştüğünü kullanıcı
      // göremezse beyanı eksik kalır ve bunu asla fark etmez.
      setUyari(
        t("secimlerinizAyriSektoreYayiliyorEn", { n: mainIds.length, max: MAX_COMPANY_MAIN_CATEGORIES }),
      );
      return;
    }
    setUyari(null);
    onChange({ mainIds, subIds });
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

  /**
   * Bir seçimi kaldır. Ata zinciri de saklandığı için yalnız kodun kendisini
   * silmek YETMEZ — L3/L2 kayıtları kalsaydı firma sildiğini sandığı daldan
   * bildirim almaya devam ederdi. Kardeş seçimlerin ihtiyaç duyduğu atalar
   * yeniden kurulur.
   */
  const altSil = (id: string) => {
    const kalan = secilenler.filter((x) => x !== id);
    const korunanMain = value.mainIds.filter(
      (m) => !value.subIds.some((s) => categorySegment(s) === m),
    );
    onChange(expandCompanyCategorySelection(kalan, korunanMain));
  };

  /** Segment silinince altındaki her şey gider — zincirleme. */
  const segmentSil = (seg: string) => {
    onChange({
      mainIds: value.mainIds.filter((x) => x !== seg),
      subIds: removeCategoryBranch(value.subIds, seg),
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
                {t("urunHizmetSecin")}
              </span>
              <span className="mt-0.5 block text-xs text-zinc-500">
                {t("sektorunuzSeciminizdenOtomatikBelirlenir")}
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
                    aria-label={t("sektorunuVeAltindakiSecimleriKaldir", { segmentAdi: segmentAdi(seg) })}
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
                      /* Yol tooltip'te: kullanıcı yaprağı seçti, hangi sınıfın
                         altında olduğunu (ve dolayısıyla neyle eşleşeceğini)
                         görebilmeli. */
                      title={y.yol || y.ad}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                    >
                      <span className="max-w-[220px] truncate">{y.ad}</span>
                      {!disabled ? (
                        <button
                          type="button"
                          onClick={() => altSil(y.id)}
                          aria-label={t("seciminiKaldir", { ad: y.ad })}
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
                  {t("sektorunTamamiBuAlandakiHer")}
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
              {t("urunHizmetEkle")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSegmentOpen(true)}
            className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
          >
            {t("sektorGeneliEkle")}
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
          value={secilenler}
          onConfirm={altOnayla}
          mode="multi"
          maxSelection={MAX_COMPANY_SUB_PICKS}
          title={modalTitle}
          description={t("tamOlarakNeAlipSattiginizi")}
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
          title={t("sektorGeneli")}
          description={t("birSektorunTamamindaCalisiyorsanizBuradan")}
        />
      ) : null}
    </div>
  );
}
