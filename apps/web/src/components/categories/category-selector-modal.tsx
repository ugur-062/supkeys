"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/catalyst/badge";
import { Checkbox } from "@/components/catalyst/checkbox";
import { ChevronRight, FolderTree, Loader2, X } from "lucide-react";
import {
  CategoryDialogNotices,
  CategoryDialogShell,
  CategorySearchField,
  type DialogFlash,
  SelectionCounter,
  SelectionStrip,
  sameIdSet,
} from "./category-dialog-shell";
import { LoadError } from "./category-load-error";

/** Sol disclosure oku — ▸ kapalı, ▾ açık (90° döner). Klasör ikonu yok. */
function Disclosure({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
        open ? "rotate-90 text-zinc-600" : ""
      }`}
    />
  );
}

/** Disclosure oku olmayan satırlarda hizalama için boşluk. */
function DisclosureSpacer() {
  return <span className="w-4 shrink-0" aria-hidden />;
}

/**
 * Ağaçtaki BAŞLIK satırlarının (sektör, aile) onay kutusu — dokunma hedefi.
 * Bu satırlarda ada basmak dalı açar; işaretlemenin tek yolu kutudur ve kutu
 * 18 px'tir (geniş ekranda 16). Görünmeyen çerçeve hedefi her yönde 8 px
 * büyütür (34 / 32 px): komşu ok ve ad düğmesine dayanır, üstlerine binmez
 * (aralıklar 8 px). Sınıf / emtia satırlarında ad da işaretlediği için gerekmez.
 */
const HEADING_TICK = "relative flex-shrink-0 after:absolute after:-inset-2";
import {
  type CategoryCatalog,
  categoryAncestors,
  categoryLevel,
  categorySearchStem,
  categorySegment,
  foldSearchText,
  tokenizeQuery,
  visibleCategoryIds,
} from "@rothern/shared";
import {
  type CategoryNode,
  type SearchTreeClass,
  type SearchTreeFamily,
  type SearchTreeSegment,
  useCategoriesByIds,
  useCategorySearchTree,
  useChildren,
  useRoots,
} from "@/hooks/use-categories";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { plainBreadcrumb } from "./category-breadcrumb";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  value: string[];
  onConfirm: (ids: string[]) => void;
  mode?: "single" | "multi";
  maxSelection?: number;
  title?: string;
  description?: string;
  /**
   * Hangi Ariba kataloğu gösterilsin:
   *   "discovery" → talep/ilan kategorisi (Discovery alt kümesi)
   *   "full"      → firma "hangi alandasınız" seçimi (tam katalog, varsayılan)
   * Yalnız L4 yaprakta ayrışıyorlar; segment/aile/sınıf ikisinde de aynı.
   */
  catalog?: CategoryCatalog;
  /**
   * Onay öncesi doğrulama: metin dönerse modal KAPANMAZ, taslak korunur ve
   * metin modal içinde gösterilir (ör. firma seçiminde sektör tavanı — onay
   * sonrası reddedilince kullanıcının tüm taslağı kayboluyordu, derin denetim
   * 2026-09-29). `null` → onaylanır.
   */
  validate?: (ids: string[]) => string | null;
  /**
   * Seçilebilen EN ÜST seviye. `3` (varsayılan): sınıf + emtia — talep/ilan
   * kategorisinin kuralı (backend kapısı `level ≥ 3`), DEĞİŞMEZ. `2`: aile de
   * işaretlenebilir (kök kural "firma ALT kategori L2-4"; API `minLevel: 2`).
   * `1`: SEKTÖR satırı da işaretlenebilir = "sektörün tamamı" — firma beyanı
   * bunu kullanır (2026-10-08, kullanıcı: "üst başlıktan seçemiyorlar"; eskiden
   * sektörün tamamı ayrı bir bağlantının açtığı ikinci pencereden beyan
   * ediliyordu ve ağaçtaki sektör satırı yalnız aç/kapa başlığıydı).
   */
  minSelectableLevel?: 1 | 2 | 3;
  /**
   * Dal başına TEK seçim: bir kod işaretlenince taslaktaki ataları ve
   * altındakiler düşer. Firma beyanı bunu ister — depo ata zincirini zaten
   * yazıyor ve gösterim yalnız en derin kodu çiziyor (`deepestCategoryPicks`);
   * sınıf + kendi emtiası birlikte işaretlenince sayaç "2" derken onaydan
   * sonra tek çip kalıyordu. Sektör işaretlenebiliyorsa aynı kural onu da
   * kapsar: sektör işaretlenince altındakiler, altından bir öğe işaretlenince
   * sektör işareti düşer.
   */
  singlePickPerBranch?: boolean;
  /** Tavan aşımı uyarısı — çağıranın kendi sözcüğüyle ("ürün/hizmet"). */
  limitMessage?: string;
  /**
   * İKİNCİ TAVAN — seçimlerin yayılabileceği en fazla sektör (firma beyanı:
   * 5). Sayılan şey: işaretli sektörler + diğer seçimlerin sektörleri (aynı
   * sektörden on seçim tek sektördür). Verilince:
   *  - `maxSelection` yalnız sektör ALTINDAKİ seçimleri sayar (sektör işareti
   *    bir ürün/hizmet değildir),
   *  - sayaç iki tavanı kendi adıyla ayrı ayrı gösterir,
   *  - tavanı aşacak işaret reddedilir ve nedeni söylenir (eskiden yalnız
   *    "Onayla"da reddediliyordu; kullanıcı altıncı sektöre girdiğini listeyi
   *    doldurduktan sonra öğreniyordu). Sektör tavanında reddedilen, sektör
   *    sayısını ARTIRAN işarettir: tavanın üstünde kayıtlı eski bir beyanda
   *    aynı sektör içindeki değişim (tamamı ↔ altından öğe) serbest kalır.
   * Çağıranın `validate`i onay anındaki son denetim olarak kalır.
   */
  maxSectors?: number;
}

/** `a` ile `b` aynı dalda mı (biri ötekinin atası). Hiyerarşi koddan okunur. */
function sameBranch(a: string, b: string): boolean {
  if (a === b) return false;
  return categoryAncestors(a).includes(b) || categoryAncestors(b).includes(a);
}

/** Kod bir sektör (L1) mü — "sektörün tamamı" işareti. */
const isSectorCode = (id: string) => categoryLevel(id) === 1;

/** Seçimlerin yayıldığı sektörler (işaretli sektörler + diğerlerinin sektörleri). */
function sectorsOf(ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const sector = categorySegment(id);
    if (sector) out.add(sector);
  }
  return out;
}

/**
 * V2-6 — PratisPro tarzı modal kategori seçici. 4-seviye lazy loading:
 *  Segment → Family → Class (seçilebilir) → Commodity (seçilebilir).
 * Varsayılan: Class + Commodity seçilebilir, Segment + Family accordion
 * başlığı; `minSelectableLevel={2}` ile Family, `{1}` ile Segment de
 * seçilebilir (firma beyanı: her seviye tek pencerede işaretlenir).
 *
 * Draft state pattern: kullanıcı "Onayla" yapana kadar parent onChange tetiklenmez.
 */
export function CategorySelectorModal({
  isOpen,
  onClose,
  value: rawValue,
  onConfirm,
  mode = "multi",
  maxSelection = 20,
  title,
  description,
  catalog = "full",
  validate,
  minSelectableLevel = 3,
  singlePickPerBranch = false,
  limitMessage,
  maxSectors,
}: Props) {
  const tr = useTranslations("web.shared.categorySelectorModal");
  // Pencere kataloğu SUNAN yüzeydir: gizli segmentteki eski kod (2026-10-09)
  // taslağa hiç girmez — seçim şeridinde çip, sayaçta sayı olmaz. Çağıranlar
  // değeri zaten süzer; burası ikinci kat. `useMemo`: taslağı sıfırlayan efekt
  // `value` kimliğine bağlı, her çizimde yeni dizi taslağı sürekli sıfırlardı.
  const value = useMemo(() => visibleCategoryIds(rawValue), [rawValue]);
  const [draftIds, setDraftIds] = useState<string[]>(value);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  /**
   * Kısa ömürlü bildirim — listenin ÜSTÜNE biner, yerleşimi itmez (araya
   * giren satır listeyi parmağın altından kaydırıyordu).
   */
  const [flash, setFlash] = useState<DialogFlash | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const chipListRef = useRef<HTMLUListElement>(null);
  /** Klavyeyle kaldırılan çipin sırası — odak sıradaki çipe taşınır. */
  const refocusChip = useRef<number | null>(null);
  /** `validate` reddi — kendiliğinden kaybolmaz; seçim değişince silinir. */
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(
    new Set(),
  );
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(
    new Set(),
  );
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(
    new Set(),
  );

  const {
    data: roots,
    isLoading: rootsLoading,
    isError: rootsError,
    isFetching: rootsFetching,
    refetch: refetchRoots,
    // Hata listenin yerinde "Yeniden dene" ile çizilir → genel toast ve 429'da
    // otomatik tekrar yok (arama ve ad sorgularıyla aynı politika).
  } = useRoots({ inlineError: true });
  const {
    data: searchTree,
    isLoading: searchLoading,
    isError: searchError,
    isFetching: searchFetching,
    refetch: refetchSearch,
  } = useCategorySearchTree(debouncedSearch, catalog, { inlineError: true });
  // Seçilen kategorilerin breadcrumb'larını getir — header chip listesi için.
  // `isPlaceholderData`: yeni seçim eklenince sorgu anahtarı değişir ve cevap
  // gelene kadar ÖNCEKİ liste döner — o sırada listede olmayan id "silinmiş"
  // değil, henüz yükleniyor.
  const {
    data: selectedInfo,
    isPlaceholderData,
    isError: namesError,
    isFetching: namesFetching,
    refetch: refetchNames,
  } = useCategoriesByIds(draftIds, { inlineError: true });
  // O(1) lookup için Map'e dönüştür — N seçimde linear .find() yerine.
  const selectedInfoMap = useMemo(() => {
    if (!selectedInfo) return null;
    return new Map(selectedInfo.map((c) => [c.id, c]));
  }, [selectedInfo]);
  /**
   * Ad isteği DÜŞTÜ — "…" (yükleniyor) ya da "silinmiş" değil; ayrı durum.
   * Yeniden deneme sürerken (istek yolda) hata sayılmaz: çipler "…" gösterir.
   */
  const namesFailed = !!namesError && !namesFetching;
  /** Veri yokken yolda olan istek = yükleniyor (ilk yükleme ya da yeniden deneme). */
  const rootsBusy = rootsLoading || (!!rootsFetching && roots === undefined);
  const searchBusy = searchLoading || (!!searchFetching && searchTree === undefined);

  // Kutu boşaltılınca (X düğmesi) gecikmeli değeri beklemeden ağaca dönülür.
  const isSearching =
    search.trim().length >= 2 && debouncedSearch.trim().length >= 2;
  const dirty = !sameIdSet(draftIds, value);

  // Modal her açılışta draft'ı parent value'ya sıfırlar.
  useEffect(() => {
    if (!isOpen) return;
    setDraftIds(value);
    setSearch("");
    setExpandedSegments(new Set());
    setExpandedFamilies(new Set());
    setExpandedClasses(new Set());
    setFlash(null);
    setConfirmError(null);
  }, [isOpen, value]);

  useEffect(() => {
    setConfirmError(null);
    // Çip klavyeyle kaldırıldıysa odak <body>'ye düşmesin: sıradaki çipin
    // düğmesine, çip kalmadıysa arama kutusuna.
    const idx = refocusChip.current;
    if (idx === null) return;
    refocusChip.current = null;
    const buttons = chipListRef.current?.querySelectorAll<HTMLButtonElement>(
      "button[data-chip-remove]",
    );
    const next = buttons?.[Math.min(idx, (buttons?.length ?? 1) - 1)];
    (next ?? searchRef.current)?.focus();
  }, [draftIds]);

  useEffect(() => {
    if (!flash) return;
    // Bilgi notu bir cümle; okunacak kadar kalır.
    const t = setTimeout(() => setFlash(null), flash.tone === "info" ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [flash]);

  // Scroll lock + ESC + focus trap'i Headless Dialog yönetir (kabuk).

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (id: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

  /**
   * `id` eklenirse bir tavan aşılıyor mu — aşılıyorsa söylenecek metin.
   * `kept`: dal kuralı uygulandıktan SONRA taslakta kalanlar (sektör
   * işaretlenince altındaki seçimler düşer; SEÇİM tavanı ondan sonra sayılır).
   * Sektör tavanı ise taslağın dal kuralından ÖNCEKİ hâline bakar (aşağıda).
   */
  const limitRefusal = (kept: readonly string[], id: string): string | null => {
    const picksLimit =
      limitMessage ??
      tr("enFazlaKategoriSecebilirsiniz", { maxSelection: maxSelection });
    if (maxSectors === undefined) {
      return kept.length >= maxSelection ? picksLimit : null;
    }
    // İki tavan. Sektör işareti ürün/hizmet tavanına girmez …
    if (
      !isSectorCode(id) &&
      kept.filter((x) => !isSectorCode(x)).length >= maxSelection
    ) {
      return picksLimit;
    }
    // … sektör tavanı ise YENİ bir sektöre girildiğinde sayılır: zaten seçim
    // olan sektöre eklemek (ya da o sektörün tamamını işaretlemek) sektör
    // sayısını değiştirmez.
    //
    // "Yeni" TASLAĞIN KENDİSİNE (`draftIds`) göre ölçülür, `kept`e göre değil.
    // Dal kuralının düşürdüğü kodlar `id` ile aynı daldadır, yani aynı
    // sektördedir → işaretten sonraki sektör kümesi = taslağın sektörleri ∪
    // {`id`nin sektörü}; sayı yalnız o sektör taslakta HİÇ yoksa artar.
    // `kept`e bakmak, sektörün tek kaydı düşen işaretse (sektörün tamamı ↔
    // altından bir öğe) aynı sektörü "yeni" sayıyordu. Tavanın altında fark
    // etmiyordu; tavanın ÜSTÜNDE kayıtlı eski beyanda (Ayarlar eskiden 10
    // sektöre izin veriyordu) sektör eklemeyen bu değişim "en fazla N sektör"
    // diye reddediliyordu (inceleme 2026-10-08). Öyle bir beyanın onayını,
    // tavana inene dek çağıranın `validate`i zaten reddeder.
    const sectors = sectorsOf(draftIds);
    const own = categorySegment(id);
    if (own && !sectors.has(own) && sectors.size >= maxSectors) {
      return tr("enFazlaSektordeSecimYapabilirsiniz", { max: maxSectors });
    }
    return null;
  };

  const toggleSelection = (id: string) => {
    if (mode === "single") {
      setDraftIds(draftIds.includes(id) ? [] : [id]);
      return;
    }
    if (draftIds.includes(id)) {
      setDraftIds(draftIds.filter((x) => x !== id));
      return;
    }
    // Dal başına tek seçim: yeni kodun ataları ve altındakiler taslaktan düşer
    // → sayaç, "Onayla (n)" ve onaydan sonra çizilen çipler aynı sayıyı verir.
    const kept = singlePickPerBranch
      ? draftIds.filter((x) => !sameBranch(x, id))
      : draftIds;
    const refusal = limitRefusal(kept, id);
    if (refusal) {
      setFlash({ text: refusal, tone: "warn" });
      return;
    }
    // Sessizce düşürmek "seçtiğim kayboldu" dedirtir — tek cümleyle söylenir.
    // Kaç seçim düştüyse o söylenir: aile işaretlenince altındaki iki yaprak
    // düşerken not "diğer seçiminiz" (tekil) diyordu (recategory-new-4).
    const removed = draftIds.length - kept.length;
    if (removed > 0) {
      setFlash({ text: tr("ayniDaldanTekSecimTutulur", { n: removed }), tone: "info" });
    }
    setDraftIds([...kept, id]);
  };

  const handleConfirm = () => {
    const err = validate?.(draftIds) ?? null;
    if (err) {
      setConfirmError(err);
      return;
    }
    onConfirm(draftIds);
    onClose();
  };

  // Single mod: başlık seçili id'nin KENDİ kaydını gösterir — placeholder
  // (önceki seçim) listesinin ilk elemanı değil.
  const singleInfo =
    mode === "single" ? selectedInfo?.find((c) => c.id === draftIds[0]) : undefined;
  const singleLoading = selectedInfo === undefined || (isPlaceholderData && !singleInfo);

  const defaultDescription =
    mode === "single"
      ? tr("satinAlmaTalebiIcin1")
      : tr("tedarikEdebildiginizKategorileriIsaretleyinI");

  const retryLabel = tr("yenidenDene");
  const selectFamily = minSelectableLevel <= 2;
  const selectSector = minSelectableLevel === 1;

  // İki tavanlı sayaç: sektör (yayılım) + sektör altındaki seçimler.
  const sectorCount = sectorsOf(draftIds).size;
  const pickCount = draftIds.filter((id) => !isSectorCode(id)).length;
  const tallies =
    maxSectors === undefined
      ? undefined
      : [
          {
            text: tr("sayacSektor", { n: sectorCount, max: maxSectors }),
            srText: tr("sayacSektorOkunus", { n: sectorCount, max: maxSectors }),
          },
          {
            text: tr("sayacUrunHizmet", { n: pickCount, max: maxSelection }),
            srText: tr("sayacUrunHizmetOkunus", { n: pickCount, max: maxSelection }),
          },
        ];

  return (
    <CategoryDialogShell
      isOpen={isOpen}
      onClose={onClose}
      dirty={dirty}
      title={title ?? tr("kategoriSec")}
      description={description ?? defaultDescription}
      icon={<FolderTree className="h-5 w-5 text-zinc-700" />}
      footerStatus={
        mode === "multi" && draftIds.length > 0
          ? tr("secimHazirOnaylaYaTiklayin", { n: draftIds.length })
          : mode === "single" && draftIds.length === 1
            ? tr("n1KategoriHazir")
            : tr("listedenSecimYapin")
      }
      // Başlangıçta seçim varsa boş seçim de onaylanabilir — "Tümünü temizle"
      // sonrası düğme kapalı kalıyor, temizleme kaydedilemiyordu (arayüz testi D-345).
      confirmDisabled={draftIds.length === 0 && value.length === 0}
      confirmLabel={
        draftIds.length > 0 ? tr("onaylaN", { n: draftIds.length }) : tr("onayla")
      }
      onConfirm={handleConfirm}
    >
      <CategorySearchField
        value={search}
        onChange={setSearch}
        inputRef={searchRef}
        placeholder={tr("kategoriAra")}
        // Tek karakterde arama başlamaz (API en az 2 ister); ağaç yerinde
        // kalıyor ve kullanıcı neden sonuç gelmediğini bilmiyordu.
        helper={
          search.trim().length === 1 ? (
            <span role="status">{tr("aramakIcinEnAz2Karakter")}</span>
          ) : (
            tr("kategoriAraOrnCelikKablo")
          )
        }
      />

      {/* Seçilenler — chip listesi (mode=multi'de görünür) */}
      {mode === "multi" ? (
        <div className="shrink-0 border-b border-zinc-950/5 bg-zinc-50/60 px-4 py-2.5 sm:px-6 sm:py-3">
          <SelectionCounter
            label={tr("seciminiz")}
            count={draftIds.length}
            max={maxSelection}
            tallies={tallies}
            clearLabel={tr("tumunuTemizle")}
            // Düğme temizleyince DOM'dan gider: klavyeyle tetiklendiyse odak
            // <body>'ye düşmesin, arama kutusuna geçsin (çip kaldırmayla aynı kural).
            onClear={(viaKeyboard) => {
              if (viaKeyboard) searchRef.current?.focus();
              setDraftIds([]);
            }}
          />
          {draftIds.length === 0 ? (
            <p className="mt-2 py-1 text-xs italic text-zinc-500">
              {tr("henuzSecimYokAsagidakiListeden")}
            </p>
          ) : (
            <>
              {namesFailed ? (
                <LoadError
                  compact
                  message={tr("secimAdlariYuklenemedi")}
                  retryLabel={retryLabel}
                  onRetry={() => void refetchNames?.()}
                />
              ) : null}
              {/* Yüksekliği sınırlı, kendi içinde kayan ve kaydığını söyleyen
                  şerit — yerleşim kuralları ve "⌄ +N" ipucu `SelectionStrip`te. */}
              <SelectionStrip listRef={chipListRef} label={tr("seciminiz")}>
                {draftIds.map((id, index) => {
                  const info = selectedInfoMap?.get(id);
                  const loading =
                    !namesFailed &&
                    (selectedInfoMap === null || (isPlaceholderData && !info));
                  const missing = !loading && !namesFailed && !info;
                  // Ad düştüyse çip kodu gösterir: seçimler ayırt edilir ve
                  // kaldırılabilir kalır ("…" kalıcı görünüyordu).
                  const label =
                    info?.nameTr ??
                    (namesFailed ? id : loading ? "…" : tr("silinmisKategori"));
                  // Sektör işareti bir ürün/hizmet adı gibi görünmesin: çip
                  // "sektörün tamamı" olduğunu söyler (ad aynı kalır).
                  const wholeSector = selectSector && isSectorCode(id);
                  return (
                    // `group/chip`: şerit çok uzun EKLİ çipi ölçüp `<li>`ye
                    // `data-split` yazar (bkz. `SelectionStrip`); sınıflar ona bakar.
                    <li key={id} className="group/chip max-w-full">
                      <Badge
                        color="zinc"
                        className={`max-w-full gap-1 ${missing ? "italic" : ""}`}
                        // Yol yoksa ad: şeritte kırpılan adın tamamı ipucunda okunur.
                        title={plainBreadcrumb(info?.breadcrumb) || info?.nameTr || undefined}
                      >
                        {/* ÇİP ŞERİTTE EN ÇOK 3 SATIR (arayüz testi CAT-D3): uzun
                            bir sektör adı 360 px'te dört satır tutup şeridi tek
                            başına dolduruyordu. Sabit piksel tavanı yok; sığan
                            ad tam yazılır. Adın TAMAMI listede, sayfadaki
                            kartta, çipin ipucunda ve kaldırma düğmesinin
                            adında durur. */}
                        {wholeSector ? (
                          // Ek adın peşinden akar. Üç satırı aşan çipte şerit
                          // `data-split` yazar: ad iki satıra kırpılır, satır
                          // içi ek gizlenir (yer tutar → ölçüm değişmez) ve ek
                          // KENDİ satırında görünür — kırpma eki kesmesin, çip
                          // bütün sektörü beyan ettiğini hep söylesin.
                          <span className="min-w-0">
                            <span
                              data-chip-run
                              className="block break-words group-data-[split]/chip:line-clamp-2"
                            >
                              <span data-slot="chip-name">{label}</span>{" "}
                              <span className="font-normal whitespace-nowrap text-zinc-500 group-data-[split]/chip:invisible">
                                · {tr("sektorunTamami")}
                              </span>
                            </span>
                            <span
                              data-slot="chip-suffix-row"
                              className="hidden font-normal whitespace-nowrap text-zinc-500 group-data-[split]/chip:block"
                            >
                              · {tr("sektorunTamami")}
                            </span>
                          </span>
                        ) : (
                          <span
                            data-slot="chip-name"
                            className="line-clamp-3 min-w-0 break-words"
                          >
                            {label}
                          </span>
                        )}
                        <button
                          type="button"
                          data-chip-remove
                          onClick={(e) => {
                            // Klavye tetiklemesinde `detail` 0'dır; dokunmada
                            // odak taşınmaz (arama kutusu klavyeyi açardı).
                            if (e.detail === 0) refocusChip.current = index;
                            toggleSelection(id);
                          }}
                          className="-my-1.5 -mr-2.5 -ml-2.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:text-danger-600 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-zinc-900"
                          aria-label={tr("seciminiKaldir", { name: info?.nameTr ?? id })}
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </Badge>
                    </li>
                  );
                })}
              </SelectionStrip>
            </>
          )}
        </div>
      ) : draftIds.length > 0 ? (
        <div className="shrink-0 border-b border-zinc-950/5 bg-zinc-50/60 px-4 py-2.5 sm:px-6">
          <span className="block text-xs font-semibold text-zinc-700">
            {tr("secili", {
              name:
                singleInfo?.nameTr ??
                (namesFailed
                  ? draftIds[0]
                  : singleLoading
                    ? "…"
                    : tr("silinmisKategori")),
            })}
          </span>
          {/* Tam yol — "Aksesuarlar" gibi bağlamsız yaprak adları için. */}
          {singleInfo?.breadcrumb ? (
            <span className="mt-0.5 block truncate text-xs text-zinc-500">
              {plainBreadcrumb(singleInfo.breadcrumb)}
            </span>
          ) : null}
          {namesFailed && !singleInfo ? (
            <LoadError
              compact
              message={tr("secimAdlariYuklenemedi")}
              retryLabel={retryLabel}
              onRetry={() => void refetchNames?.()}
            />
          ) : null}
        </div>
      ) : null}

      {/* Onay reddi + kısa bildirim: kısa ekranda kayan bölümün tepesine yapışır. */}
      <CategoryDialogNotices rejection={confirmError} flash={flash} />

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col [@media(max-height:520px)]:flex-none">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 [@media(max-height:520px)]:overflow-visible">
          {isSearching ? (
            <SearchResults
              loading={searchBusy}
              // Düşen istek "sonuç bulunamadı" DEĞİLDİR — ayrı durum + yeniden dene.
              error={!!searchError && searchTree === undefined}
              onRetry={() => void refetchSearch?.()}
              segments={searchTree?.segments ?? []}
              truncated={searchTree?.truncated}
              query={debouncedSearch.trim()}
              selected={draftIds}
              mode={mode}
              onToggle={toggleSelection}
              selectFamily={selectFamily}
              selectSector={selectSector}
            />
          ) : rootsBusy ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : rootsError && roots === undefined ? (
            <LoadError
              message={tr("kategorilerYuklenemediYenidenDeneyin")}
              retryLabel={retryLabel}
              onRetry={() => void refetchRoots?.()}
            />
          ) : (
            <SegmentList
              roots={roots ?? []}
              expandedSegments={expandedSegments}
              expandedFamilies={expandedFamilies}
              expandedClasses={expandedClasses}
              onToggleSegment={toggle(setExpandedSegments)}
              onToggleFamily={toggle(setExpandedFamilies)}
              onToggleClass={toggle(setExpandedClasses)}
              selected={draftIds}
              onToggleSelection={toggleSelection}
              mode={mode}
              catalog={catalog}
              selectFamily={selectFamily}
              selectSector={selectSector}
            />
          )}
        </div>
      </div>
    </CategoryDialogShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Internal subcomponents
// ─────────────────────────────────────────────────────────────────────

interface SegmentListProps {
  roots: CategoryNode[];
  expandedSegments: Set<string>;
  expandedFamilies: Set<string>;
  expandedClasses: Set<string>;
  onToggleSegment: (id: string) => void;
  onToggleFamily: (id: string) => void;
  onToggleClass: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
  catalog: CategoryCatalog;
  /** Aile (L2) satırı da onay kutusu taşır — `minSelectableLevel` 2 ya da 1. */
  selectFamily: boolean;
  /** Sektör (L1) satırı da onay kutusu taşır — `minSelectableLevel={1}`. */
  selectSector: boolean;
}

/**
 * İşaretli sektör satırının altındaki açıklama: sektör işareti o sektördeki
 * HER ŞEYİ kapsar. Söylenmezse kullanıcı sektörü işaretleyip dalı açınca
 * altındaki kutuları boş görür ve hepsini tek tek işaretlemeye girişir (o zaman
 * da dal kuralı sektör işaretini düşürür).
 *
 * İç boşluk metni sektör adıyla hizalar (Chromium'da ölçüldü): satır iç
 * boşluğu 8 + ok 16 + aralık 8 + onay kutusu (telefonda 18, geniş ekranda
 * 16 px) + aralık 8 → 58 / 56 px.
 */
function WholeSectorNote() {
  const t = useTranslations("web.shared.categorySelectorModal");
  return (
    <p
      data-slot="whole-sector-note"
      className="-mt-1 pr-2 pb-2 pl-[3.625rem] text-xs text-zinc-600 sm:pl-14"
    >
      {t("sektorunTamamiSecili")}
    </p>
  );
}

/**
 * SEKTÖR satırının onay kutusu — ağaçta ve arama sonucunda TEK bileşen (iki
 * yerde ayrı yazılınca biri bayatlar).
 *
 * Erişilebilir adı çıplak sektör adı DEĞİLDİR (inceleme CAT-R1, 2026-10-08):
 * çıplak ad yanındaki aç/kapa ve ad düğmesiyle aynıydı. Ekran okuyucu "Elektrik,
 * onay kutusu" diyor, Space'ten sonra yalnız "işaretli" duyuluyordu — kutunun
 * sektörün TAMAMINI beyan ettiğini (aile / sınıf / emtia kutuları tek öğedir)
 * söyleyen tek şey, işaretlenince beliren ve kutuya bağlı olmayan görsel nottu.
 * Ad artık seçim şeridindeki çiple aynı ifadeyi taşır ("… · sektörün tamamı");
 * işaretliyken görünen notun metni de kutunun açıklamasıdır (alttaki kutular
 * boş görünür; kapsamı Tab ile gezen kullanıcı da duyar).
 *
 * `aria-describedby` KULLANILMAZ: Headless Checkbox onu kendi (Field) değeriyle
 * ezer, nota bağlanamaz. `aria-description` ezilmez; onu tanımayan tarayıcıda
 * anlamı ad tek başına taşır.
 */
function SectorTick({
  name,
  checked,
  onToggle,
  className,
}: {
  name: string;
  checked: boolean;
  onToggle: () => void;
  className: string;
}) {
  const t = useTranslations("web.shared.categorySelectorModal");
  return (
    <Checkbox
      checked={checked}
      onChange={onToggle}
      className={className}
      aria-label={`${name} · ${t("sektorunTamami")}`}
      aria-description={checked ? t("sektorunTamamiSecili") : undefined}
    />
  );
}

function SegmentList({
  roots,
  expandedSegments,
  expandedFamilies,
  expandedClasses,
  onToggleSegment,
  onToggleFamily,
  onToggleClass,
  selected,
  onToggleSelection,
  mode,
  catalog,
  selectFamily,
  selectSector,
}: SegmentListProps) {
  const t = useTranslations("web.shared.categorySelectorModal");
  if (roots.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-zinc-500">
          {t("kategoriBulunamadiSistemYoneticisiyleIletisi")}
        </p>
      </div>
    );
  }

  // UNSPSC standardı: 70-94 arası segment kodları hizmettir, diğerleri
  // mal/ürün/ekipman. (Eski `7|8` ilk-hane kontrolü 90+ hizmet segmentlerini
  // yanlışlıkla "Mal" grubuna koyuyordu.)
  const isService = (s: CategoryNode) => {
    const n = Number(s.code.slice(0, 2));
    return n >= 70 && n <= 94;
  };
  const malSegments = roots.filter((s) => !isService(s));
  const hizmetSegments = roots.filter(isService);

  const renderSegment = (segment: CategoryNode) => {
    const isExpanded = expandedSegments.has(segment.id);
    // Kategori id = 8-haneli kod → segment aidiyeti ilk 2 haneden okunur;
    // kapalı başlıkta "bu dalda n seçim var" rozeti ekstra fetch istemez.
    const selCount = selected.filter((id) =>
      id.startsWith(segment.code.slice(0, 2)),
    ).length;
    const isSelected = selectSector && selected.includes(segment.id);
    const counter =
      selCount > 0 ? (
        <span
          className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs font-bold text-white"
          title={t("buDaldaSecim", { n: selCount })}
        >
          {selCount}
        </span>
      ) : null;
    return (
      <li key={segment.id}>
        {selectSector ? (
          // Aile satırıyla aynı dizilim: ok (aç/kapa) · onay kutusu · ad.
          // Kutu SEKTÖRÜN TAMAMINI işaretler; ada tıklamak dalı açar (ağaçta
          // gezinen kullanıcı yanlışlıkla bütün sektörü beyan etmesin).
          <div
            className={`rounded-lg transition-colors ${
              isSelected
                ? "bg-zinc-50 ring-1 ring-zinc-950/10"
                : isExpanded
                  ? "bg-zinc-50"
                  : "hover:bg-zinc-50"
            }`}
          >
            <div className="flex items-center gap-2 px-2 py-2.5">
              <button
                type="button"
                onClick={() => onToggleSegment(segment.id)}
                className="-ml-1 shrink-0 rounded p-0.5 hover:bg-zinc-100"
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? t("daralt") : t("genislet")}: ${segment.nameTr}`}
              >
                <Disclosure open={isExpanded} />
              </button>
              <SectorTick
                name={segment.nameTr}
                checked={isSelected}
                onToggle={() => onToggleSelection(segment.id)}
                className={HEADING_TICK}
              />
              <button
                type="button"
                onClick={() => onToggleSegment(segment.id)}
                aria-expanded={isExpanded}
                className="min-w-0 flex-1 text-left text-sm font-semibold text-zinc-900"
              >
                {segment.nameTr}
              </button>
              {counter}
            </div>
            {isSelected ? <WholeSectorNote /> : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onToggleSegment(segment.id)}
            aria-expanded={isExpanded}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition-colors ${
              isExpanded ? "bg-zinc-50" : "hover:bg-zinc-50"
            }`}
          >
            <Disclosure open={isExpanded} />
            <span className="flex-1 text-sm font-semibold text-zinc-900">
              {segment.nameTr}
            </span>
            {counter}
          </button>
        )}

        {isExpanded ? (
          <FamilyList
            segmentId={segment.id}
            expandedFamilies={expandedFamilies}
            expandedClasses={expandedClasses}
            onToggleFamily={onToggleFamily}
            onToggleClass={onToggleClass}
            catalog={catalog}
            selected={selected}
            onToggleSelection={onToggleSelection}
            mode={mode}
            selectFamily={selectFamily}
          />
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {malSegments.length > 0 ? (
        <section>
          <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {t("malVeEkipman")}
          </h3>
          <ul className="space-y-0.5">{malSegments.map(renderSegment)}</ul>
        </section>
      ) : null}

      {hizmetSegments.length > 0 ? (
        <section>
          <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {t("hizmetler")}
          </h3>
          <ul className="space-y-0.5">{hizmetSegments.map(renderSegment)}</ul>
        </section>
      ) : null}
    </div>
  );
}

/** Ağaç dalının içinde satır içi yükleme hatası (aile / sınıf / emtia listesi). */
function BranchLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("web.shared.categorySelectorModal");
  return (
    <div className="ml-6">
      <LoadError
        compact
        message={t("buBolumYuklenemedi")}
        retryLabel={t("yenidenDene")}
        onRetry={onRetry}
      />
    </div>
  );
}

interface FamilyListProps {
  segmentId: string;
  expandedFamilies: Set<string>;
  expandedClasses: Set<string>;
  onToggleFamily: (id: string) => void;
  onToggleClass: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
  catalog: CategoryCatalog;
  selectFamily: boolean;
}

function FamilyList({
  segmentId,
  expandedFamilies,
  expandedClasses,
  onToggleFamily,
  onToggleClass,
  selected,
  onToggleSelection,
  mode,
  catalog,
  selectFamily,
}: FamilyListProps) {
  const t = useTranslations("web.shared.categorySelectorModal");
  const {
    data: families,
    isLoading,
    isError,
    refetch,
  } = useChildren(segmentId, 1, catalog);

  if (isLoading) {
    return (
      <div className="ml-6 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      </div>
    );
  }
  // Düşen istek boş dal gibi çizilmez (eskiden grup açılıyor, altı boş kalıyordu).
  if (isError) return <BranchLoadError onRetry={() => void refetch?.()} />;

  // V2-6.5 — Tek family chain'i atla. Family seviyesinde sadece 1 alt
  // kategori varsa, kullanıcıya "A → tek-B → C..." şeklinde anlamsız bir
  // ara seviye göstermek yerine direkt Class'ları render et. Aile
  // SEÇİLEBİLİR olduğunda (firma beyanı) atlanmaz: satırı görünmeli ki
  // işaretlenebilsin; altı yine kendiliğinden açık gelir.
  const single = families?.length === 1;
  if (families && single && !selectFamily) {
    return (
      <div className="ml-[15px] mt-0.5 border-l border-zinc-950/5 pl-2">
        <ClassList
          familyId={families[0].id}
          expandedClasses={expandedClasses}
          onToggleClass={onToggleClass}
          selected={selected}
          onToggleSelection={onToggleSelection}
          mode={mode}
          catalog={catalog}
        />
      </div>
    );
  }

  return (
    <ul className="ml-[15px] mt-0.5 space-y-0.5 border-l border-zinc-950/5 pl-2">
      {(families ?? []).map((family) => {
        const isExpanded = single || expandedFamilies.has(family.id);
        const childCount = family._count?.children ?? 0;
        const famSelCount = selected.filter((id) =>
          id.startsWith(family.code.slice(0, 4)),
        ).length;
        const isSelected = selected.includes(family.id);
        const counters = (
          <>
            {famSelCount > 0 ? (
              <span
                className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs font-bold text-white"
                title={t("buDaldaSecim", { n: famSelCount })}
              >
                {famSelCount}
              </span>
            ) : null}
            {childCount > 0 ? (
              <span className="text-xs tabular-nums text-zinc-500">
                {childCount}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={family.id}>
            {selectFamily ? (
              // Sınıf satırıyla aynı dizilim: ok (aç/kapa) · onay kutusu · ad.
              // Ada tıklamak eskisi gibi dalı açar; seçim onay kutusuyla.
              <div
                className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
                  isSelected
                    ? "bg-zinc-50 ring-1 ring-zinc-950/10"
                    : isExpanded
                      ? "bg-zinc-50"
                      : "hover:bg-zinc-50"
                }`}
              >
                {single ? (
                  <DisclosureSpacer />
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleFamily(family.id)}
                    className="-ml-1 shrink-0 rounded p-0.5 hover:bg-zinc-100"
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? t("daralt") : t("genislet")}: ${family.nameTr}`}
                  >
                    <Disclosure open={isExpanded} />
                  </button>
                )}
                <Checkbox
                  checked={isSelected}
                  onChange={() => onToggleSelection(family.id)}
                  className={HEADING_TICK}
                  aria-label={family.nameTr}
                />
                <button
                  type="button"
                  onClick={() =>
                    single ? onToggleSelection(family.id) : onToggleFamily(family.id)
                  }
                  aria-expanded={single ? undefined : isExpanded}
                  className={`flex-1 text-left text-sm font-medium ${
                    isSelected ? "text-zinc-950" : "text-zinc-800"
                  }`}
                >
                  {family.nameTr}
                </button>
                {counters}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onToggleFamily(family.id)}
                aria-expanded={isExpanded}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                  isExpanded ? "bg-zinc-50" : "hover:bg-zinc-50"
                }`}
              >
                <Disclosure open={isExpanded} />
                <span className="flex-1 text-sm font-medium text-zinc-800">
                  {family.nameTr}
                </span>
                {counters}
              </button>
            )}

            {isExpanded ? (
              <ClassList
                familyId={family.id}
                expandedClasses={expandedClasses}
                onToggleClass={onToggleClass}
                selected={selected}
                onToggleSelection={onToggleSelection}
                mode={mode}
                catalog={catalog}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface ClassListProps {
  familyId: string;
  expandedClasses: Set<string>;
  onToggleClass: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
  catalog: CategoryCatalog;
}

function ClassList({
  familyId,
  expandedClasses,
  onToggleClass,
  selected,
  onToggleSelection,
  mode,
  catalog,
}: ClassListProps) {
  const {
    data: classes,
    isLoading,
    isError,
    refetch,
  } = useChildren(familyId, 2, catalog);

  if (isLoading) {
    return (
      <div className="ml-6 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
      </div>
    );
  }
  if (isError) return <BranchLoadError onRetry={() => void refetch?.()} />;

  return (
    <ul className="ml-[15px] mt-0.5 space-y-0.5 border-l border-zinc-950/5 pl-2">
      {(classes ?? []).map((cls) => (
        <ClassRow
          key={cls.id}
          cls={cls}
          isExpanded={expandedClasses.has(cls.id)}
          onToggleExpand={onToggleClass}
          catalog={catalog}
          selected={selected}
          onToggleSelection={onToggleSelection}
          mode={mode}
        />
      ))}
    </ul>
  );
}

interface ClassRowProps {
  cls: CategoryNode;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
  catalog: CategoryCatalog;
}

function ClassRow({
  cls,
  isExpanded,
  onToggleExpand,
  selected,
  onToggleSelection,
  mode,
  catalog,
}: ClassRowProps) {
  const t = useTranslations("web.shared.categorySelectorModal");
  const commodityCount = cls._count?.children ?? 0;
  const hasCommodities = commodityCount > 0;
  const isSelected = selected.includes(cls.id);
  // V2-6.5 — Tek commodity zincirinde otomatik açık. Kullanıcı "Class
  // expand → tek alt görme" çift tıklamasından kurtulur. Chevron yine
  // gözükür ama state değişmez (auto-show).
  const autoOpen = commodityCount === 1;
  const effectivelyExpanded = isExpanded || autoOpen;

  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
          isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : "hover:bg-zinc-50"
        }`}
      >
        {/* Sol disclosure — yalnızca açılabilir (çok commodity'li) class'larda */}
        {hasCommodities && !autoOpen ? (
          <button
            type="button"
            onClick={() => onToggleExpand(cls.id)}
            className="-ml-1 shrink-0 rounded p-0.5 hover:bg-zinc-100"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? t("daralt") : t("genislet")}: ${cls.nameTr}`}
          >
            <Disclosure open={isExpanded} />
          </button>
        ) : (
          <DisclosureSpacer />
        )}
        <Checkbox
          checked={isSelected}
          onChange={() => onToggleSelection(cls.id)}
          className="flex-shrink-0"
          aria-label={cls.nameTr}
        />
        <button
          type="button"
          onClick={() => onToggleSelection(cls.id)}
          className={`flex-1 text-left text-sm transition-colors ${
            isSelected
              ? "font-semibold text-zinc-900"
              : "text-zinc-700 hover:text-zinc-900"
          }`}
        >
          {cls.nameTr}
        </button>
        {hasCommodities ? (
          <span className="text-xs tabular-nums text-zinc-500">
            {commodityCount}
          </span>
        ) : null}
      </div>

      {effectivelyExpanded && hasCommodities ? (
        <CommodityList
          classId={cls.id}
          selected={selected}
          onToggleSelection={onToggleSelection}
          mode={mode}
          catalog={catalog}
        />
      ) : null}
    </li>
  );
}

interface CommodityListProps {
  classId: string;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
  catalog: CategoryCatalog;
}

function CommodityList({
  classId,
  selected,
  onToggleSelection,
  catalog,
}: CommodityListProps) {
  const {
    data: commodities,
    isLoading,
    isError,
    refetch,
  } = useChildren(classId, 3, catalog);

  if (isLoading) {
    return (
      <div className="ml-6 py-1">
        <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
      </div>
    );
  }
  if (isError) return <BranchLoadError onRetry={() => void refetch?.()} />;

  return (
    <ul className="ml-[15px] mt-0.5 space-y-0.5 border-l border-zinc-950/5 pl-2">
      {(commodities ?? []).map((com) => {
        const isSelected = selected.includes(com.id);
        return (
          <li
            key={com.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
              isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : "hover:bg-zinc-50"
            }`}
          >
            <DisclosureSpacer />
            <Checkbox
              checked={isSelected}
              onChange={() => onToggleSelection(com.id)}
              className="flex-shrink-0"
              aria-label={com.nameTr}
            />
            <button
              type="button"
              onClick={() => onToggleSelection(com.id)}
              className={`flex-1 text-left text-sm transition-colors ${
                isSelected
                  ? "font-medium text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {com.nameTr}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface SearchResultsProps {
  loading: boolean;
  /** İstek düştü — "sonuç bulunamadı" değil, yeniden denenebilir hata. */
  error: boolean;
  onRetry: () => void;
  segments: SearchTreeSegment[];
  /** Backend 200 sonuç tavanına takıldı — "aramayı daraltın" notu gösterilir. */
  truncated?: boolean;
  query: string;
  selected: string[];
  mode: "single" | "multi";
  onToggle: (id: string) => void;
  selectFamily: boolean;
  selectSector: boolean;
}

/**
 * Arama ağacında çizilecek bir şeyi olan aileler. Aile SEÇİLEMEZKEN sınıfı
 * olmayan aile boş başlıktır → çizilmez; seçilebiliyorsa kendisi bir satırdır.
 */
function visibleFamilies(segment: SearchTreeSegment, selectFamily: boolean) {
  return segment.families.filter((f) => selectFamily || f.classes.length > 0);
}

/**
 * PratisPro tarzı hiyerarşik arama sonucu: eşleşen Class/Commodity'leri
 * parent path'leri (Segment → Family → Class → Commodity) ile birlikte
 * tree olarak gösterir. Path başlıkları auto-expanded, kardeş kategoriler
 * gizli — sadece match yolundaki düğümler render olur.
 *
 * API'nin döndürdüğü HER sınıf bir satırdır ve işaretlenebilir: adı eşleşen
 * ailenin (ya da sektörün) sınıfları `isMatch=false` ve emtiasız gelir;
 * eskiden bunlar hiç çizilmiyor, aile altı boş bir başlık olarak kalıyordu
 * ("hırdavat": 21 sınıf döndü, 6 onay kutusu çizildi).
 */
function SearchResults({
  loading,
  error,
  onRetry,
  segments,
  truncated,
  query,
  selected,
  mode,
  onToggle,
  selectFamily,
  selectSector,
}: SearchResultsProps) {
  const t = useTranslations("web.shared.categorySelectorModal");
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <LoadError
        message={t("aramaTamamlanamadi")}
        retryLabel={t("yenidenDene")}
        onRetry={onRetry}
      />
    );
  }

  // Sektör SEÇİLEBİLİYORSA kendisi bir satırdır: altı boş gelse de çizilir.
  const shown = segments.filter(
    (s) => selectSector || visibleFamilies(s, selectFamily).length > 0,
  );

  if (shown.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium text-zinc-700">
          {t("icinSonucBulunamadi", { query })}
        </p>
        <p className="mt-1.5 text-xs text-zinc-500">
          {t("dahaGenelBirTerimDeneyin")}
        </p>
      </div>
    );
  }

  return (
    <>
      {truncated ? (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("cokFazlaSonucVarTumu")}
        </p>
      ) : null}
      <ul className="space-y-3">
        {shown.map((seg) => (
          <SearchSegmentBlock
            key={seg.id}
            segment={seg}
            query={query}
            selected={selected}
            onToggle={onToggle}
            mode={mode}
            selectFamily={selectFamily}
            selectSector={selectSector}
          />
        ))}
      </ul>
    </>
  );
}

function SearchSegmentBlock({
  segment,
  query,
  selected,
  onToggle,
  mode,
  selectFamily,
  selectSector,
}: {
  segment: SearchTreeSegment;
  query: string;
  selected: string[];
  onToggle: (id: string) => void;
  mode: "single" | "multi";
  selectFamily: boolean;
  selectSector: boolean;
}) {
  const families = visibleFamilies(segment, selectFamily);
  const isSelected = selectSector && selected.includes(segment.id);
  return (
    <li>
      {selectSector ? (
        // Arama sonucunda dal zaten açık: ada tıklamak da işaretler (aile ve
        // sınıf satırlarıyla aynı).
        <div
          className={`rounded-lg hover:bg-zinc-50 ${
            isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : ""
          }`}
        >
          <div className="flex items-center gap-2 px-2 py-2">
            {families.length > 0 ? <Disclosure open /> : <DisclosureSpacer />}
            <SectorTick
              name={segment.nameTr}
              checked={isSelected}
              onToggle={() => onToggle(segment.id)}
              className="flex-shrink-0"
            />
            <button
              type="button"
              onClick={() => onToggle(segment.id)}
              className="min-w-0 flex-1 text-left text-sm font-semibold text-zinc-900"
            >
              <HighlightMatch text={segment.nameTr} query={query} />
            </button>
          </div>
          {isSelected ? <WholeSectorNote /> : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-zinc-900">
          <Disclosure open />
          <span>
            <HighlightMatch text={segment.nameTr} query={query} />
          </span>
        </div>
      )}
      {families.length > 0 ? (
        <ul className="ml-[15px] space-y-1 border-l border-zinc-950/5 pl-2">
          {families.map((fam) => (
            <SearchFamilyBlock
              key={fam.id}
              family={fam}
              query={query}
              selected={selected}
              onToggle={onToggle}
              mode={mode}
              selectFamily={selectFamily}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SearchFamilyBlock({
  family,
  query,
  selected,
  onToggle,
  mode,
  selectFamily,
}: {
  family: SearchTreeFamily;
  query: string;
  selected: string[];
  onToggle: (id: string) => void;
  mode: "single" | "multi";
  selectFamily: boolean;
}) {
  const isSelected = selected.includes(family.id);
  const hasClasses = family.classes.length > 0;
  return (
    <li>
      {selectFamily ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 ${
            isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : ""
          }`}
        >
          {hasClasses ? <Disclosure open /> : <DisclosureSpacer />}
          <Checkbox
            checked={isSelected}
            onChange={() => onToggle(family.id)}
            className="flex-shrink-0"
            aria-label={family.nameTr}
          />
          <button
            type="button"
            onClick={() => onToggle(family.id)}
            className="flex-1 text-left text-sm font-medium text-zinc-700"
          >
            <HighlightMatch text={family.nameTr} query={query} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-zinc-700">
          <Disclosure open />
          <span>
            <HighlightMatch text={family.nameTr} query={query} />
          </span>
        </div>
      )}
      {hasClasses ? (
        <ul className="ml-[15px] space-y-0.5 border-l border-zinc-950/5 pl-2">
          {family.classes.map((cls) => (
            <SearchClassBlock
              key={cls.id}
              cls={cls}
              query={query}
              selected={selected}
              onToggle={onToggle}
              mode={mode}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SearchClassBlock({
  cls,
  query,
  selected,
  onToggle,
}: {
  cls: SearchTreeClass;
  query: string;
  selected: string[];
  onToggle: (id: string) => void;
  mode: "single" | "multi";
}) {
  const isSelected = selected.includes(cls.id);
  const hasCommodities = cls.commodities.length > 0;

  return (
    <li>
      {/* Sınıf HER ZAMAN seçilebilir satırdır — `isMatch` yalnız vurguyu
          belirler (adı eşleşen ailenin sınıfları `isMatch=false` gelir). */}
      <div
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 ${
          isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : ""
        }`}
      >
        {hasCommodities ? <Disclosure open /> : <DisclosureSpacer />}
        <Checkbox
          checked={isSelected}
          onChange={() => onToggle(cls.id)}
          className="flex-shrink-0"
          aria-label={cls.nameTr}
        />
        <button
          type="button"
          onClick={() => onToggle(cls.id)}
          className={`flex-1 text-left text-sm ${
            hasCommodities ? "font-medium text-zinc-700" : "text-zinc-700"
          }`}
        >
          <HighlightMatch text={cls.nameTr} query={query} />
        </button>
      </div>

      {hasCommodities ? (
        <ul className="ml-[15px] space-y-0.5 border-l border-zinc-950/5 pl-2">
          {cls.commodities.map((com) => {
            const comSelected = selected.includes(com.id);
            return (
              <li
                key={com.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 ${
                  comSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : ""
                }`}
              >
                <DisclosureSpacer />
                <Checkbox
                  checked={comSelected}
                  onChange={() => onToggle(com.id)}
                  className="flex-shrink-0"
                  aria-label={com.nameTr}
                />
                <button
                  type="button"
                  onClick={() => onToggle(com.id)}
                  className="flex-1 text-left text-sm text-zinc-600"
                >
                  <HighlightMatch text={com.nameTr} query={query} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Uzunluk-koruyan katlama — vurgu konumu için karakter-karakter eşleme.
 * Kural tek kaynaktan (`foldSearchText`: TR harfleri, şapkalar, Kiril й/ё);
 * o fonksiyon boşluk tekilleştirdiği için metnin tamamına uygulanamaz (index
 * kayar) → her karakter TEK karaktere katlanır, katlanmış index = özgün index.
 */
function foldChars(s: string): string[] {
  return Array.from(s).map((ch) => {
    const folded = Array.from(foldSearchText(ch));
    return folded.length === 1 ? folded[0] : ch.toLowerCase();
  });
}

/** `needle` dizisinin `hay` içindeki bütün başlangıç konumları. */
function findAll(hay: string[], needle: string[]): number[] {
  const hits: number[] = [];
  if (needle.length === 0 || needle.length > hay.length) return hits;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

/** Harf ya da rakam — sözcük sınırı denetimi için. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Vurgulanacak aralıklar — ARAMAYLA AYNI KURAL: sorgu kelimelere bölünür
 * (`tokenizeQuery`), her kelime ayrı aranır, sırası önemsiz. Eskiden sorgunun
 * TAMAMI tek parça aranıyordu → "paslanmaz sac" 21 sonuç getiriyor, hiçbiri
 * vurgulanmıyordu.
 *
 * Bağlaçlar vurgulanmaz (`tokenizeQuery` üç dilde eler): "Manufacturing
 * Components and Supplies" sorgusu bütün satırlardaki "and"i boyuyordu
 * (recategory-new-5).
 *
 * Kelime yazıldığı biçimde geçmiyorsa KÖKÜ denenir — API ile aynı fonksiyon
 * (`categorySearchStem`: "boruları" → "boru", "rulmanlarının" → "rulman",
 * "сварка" → "сварк") ve aynı yer: kök yalnız bir sözcüğün BAŞINDA vurgulanır
 * ("nakliye" kökü "nakli", "kayNAKLIlı" içinde boyanmaz).
 */
export function highlightRanges(text: string, query: string): Array<[number, number]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const hay = foldChars(text);
  const tokens = tokenizeQuery(trimmed);
  const words = tokens.length > 0 ? tokens : [trimmed];

  const ranges: Array<[number, number]> = [];
  for (const word of words) {
    const folded = foldSearchText(word);
    if (!folded) continue;
    let needle = Array.from(folded);
    let hits = findAll(hay, needle);
    if (hits.length === 0) {
      const stem = categorySearchStem(folded);
      if (stem !== folded) {
        needle = Array.from(stem);
        hits = findAll(hay, needle).filter((at) => at === 0 || !WORD_CHAR.test(hay[at - 1]));
      }
    }
    for (const at of hits) ranges.push([at, at + needle.length]);
  }

  // Örtüşen / bitişik aralıklar birleşir ("çelik" + "çelik boru").
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/**
 * Eşleşen parçaları vurgular — katlanmış karşılaştırma: "iskele" sorgusu
 * "İskele sistemleri"ni, "jenerator" "jeneratör"ü vurgular (backend araması da
 * aynı katlamayla eşleştiğinden vurgu sonuçla tutarlı).
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;

  const chars = Array.from(text);
  const parts: Array<{ str: string; hit: boolean }> = [];
  let cursor = 0;
  for (const [from, to] of ranges) {
    if (from > cursor) {
      parts.push({ str: chars.slice(cursor, from).join(""), hit: false });
    }
    parts.push({ str: chars.slice(from, to).join(""), hit: true });
    cursor = to;
  }
  if (cursor < chars.length) {
    parts.push({ str: chars.slice(cursor).join(""), hit: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark
            key={i}
            className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900"
          >
            {part.str}
          </mark>
        ) : (
          <span key={i}>{part.str}</span>
        ),
      )}
    </>
  );
}
