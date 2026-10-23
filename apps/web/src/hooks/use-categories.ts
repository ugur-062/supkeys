"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isHiddenCategory, visibleCategoryIds, type CategoryCatalog } from "@rothern/shared";
import { api } from "@/lib/api";

/**
 * V2-6 — 4 seviye kategori sistemi (lazy loading, kaynak: Ariba kataloğu).
 *   Level 1 = Segment   (XX000000)
 *   Level 2 = Family    (XXXX0000)
 *   Level 3 = Class     (XXXXXX00)
 *   Level 4 = Commodity (XXXXXXXX)
 *
 * İKİ KATALOG (2026-09-02): `catalog="discovery"` talep/ilan kategorisi,
 * `catalog="full"` (varsayılan) firma "hangi alandasınız" seçimi. Yalnız L4
 * yaprakta ayrışıyorlar (13 yaprak), o yüzden `useCategoryTree` (L1-L2) ve
 * `useRoots` (L1) katalog ALMIYOR — o katmanlar iki katalogda birebir aynı ve
 * tek önbellek girdisi ikisine de yetiyor.
 */
export interface CategoryNode {
  id: string;
  code: string;
  nameTr: string;
  /** Dilden bağımsız adres parçası (Türkçe ad) — yalnız `segments` ucu verir (i18n Faz 4). */
  slug?: string;
  level: number;
  parentId?: string | null;
  segmentLetter?: string | null;
  sortOrder: number;
  /** Backend'den gelen direkt çocuk sayısı (L4 dahil; expand göstergesi). */
  childCount?: number;
  /** Lazy-load için child sayısı (varsa expand butonu). */
  _count?: { children: number };
}

export interface CategoryWithBreadcrumb {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  breadcrumb: string;
}

const HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Hatayı KENDİ satırında "Yeniden dene" ile gösteren çağıranlar için sorgu
 * seçeneği (kategori penceresi, firma kategori seçicisi).
 *
 * İki şeyi değiştirir:
 *  - `skipErrorToast`: satır içi hata + genel toast aynı hatayı iki kez
 *    gösteriyordu.
 *  - yeniden deneme: varsayılan politika 429 dahil 3 kez dener (1+2+4 sn);
 *    kullanıcı ~7 sn dönen simgeye bakıyor, kısıtlanan uç üstüne dört kat yük
 *    biniyordu (ölçüm: üç sektör açılırken 175 istek, 157'si 429). Elle
 *    yeniden deneme düğmesi varken 4xx hiç, ağ/5xx bir kez denenir.
 */
export interface CategoryQueryOptions {
  inlineError?: boolean;
}

function inlineErrorRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

const inlineErrorQuery = (on: boolean | undefined) =>
  on ? ({ retry: inlineErrorRetry } as const) : ({} as const);
const inlineErrorRequest = (on: boolean | undefined) =>
  on ? ({ skipErrorToast: true } as const) : ({} as const);

/**
 * Ağacın ÜST katmanı tek fetch: L1 segmentler + L2 aileler (~616 satır /
 * ~90 KB). Segment açıldığında aileler in-memory gelir; sınıf ve emtia
 * `/children` ile açıldıkça inilir.
 *
 * L3 2026-09-01'de bu cevabın DIŞINA çıktı: katalog Ariba dışa aktarımına
 * geçince L1-L3 8.582 satır / 1,43 MB oldu ve modal her açılışta bunu
 * indiriyordu.
 *
 * staleTime 5 dk: kategori güncellemesi max 5 dk'da görünsün.
 * refetchOnMount: modal her açıldığında stale olabilirse yeniden çek.
 *
 * Hata politikası KOŞULSUZ satır içi: tek tüketici `useChildren`'ın L1 dalı
 * (sektör açılınca aileler) ve o dal hatayı "Bu bölüm yüklenemedi · Yeniden
 * dene" ile kendi çizer. Varsayılan politikada 429'da dört istek (~7 sn dönen
 * simge), 5xx'te dört genel toast + satır içi hata çıkıyordu; `/children`
 * dalı ise tek istekle bitiyordu (aynı ağaç, iki ayrı davranış).
 */
export function useCategoryTree() {
  return useQuery<CategoryNode[]>({
    queryKey: ["category-tree"],
    queryFn: () =>
      api.get("/categories/all", inlineErrorRequest(true)).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * HOUR_MS,
    refetchOnMount: true,
    ...inlineErrorQuery(true),
  });
}

const withCount = (c: CategoryNode): CategoryNode => ({
  ...c,
  _count: { children: c.childCount ?? 0 },
});

/**
 * Level 1 (Segment) listesi.
 *
 * Perf turu (denetim P10 Dalga B): eskiden `/categories/all` (≈8,2k satır /
 * ~180 KB) indirilip level===1 SÜZÜLÜYORDU — yani 38 segment göstermek için
 * tüm ağaç çekiliyordu. Onboarding ve profil kategori seçimi gibi ağaca hiç
 * girilmeyen ekranlarda bu tamamen boşa trafik. Artık `/categories/segments`
 * (yalnız L1). Ağaca gerçekten inen tek yüzey seçim modalı; o drill-down
 * sırasında `useChildren`/`useCategoryTree` ile zaten kendi verisini çekiyor.
 *
 * `inlineError`: hatayı kendi satırında gösteren (ya da sektör adını `by-ids`
 * yedeğinden okuyan) çağıran geçer — kategori pencereleri ve firma seçicisi.
 * Sorgu anahtarı ortak olduğu için isteği HANGİ gözlemci başlatırsa onun
 * politikası uygulanır.
 */
export function useRoots(options: CategoryQueryOptions = {}) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<CategoryNode[]>({
    queryKey: ["category-segments"],
    queryFn: () =>
      api
        .get("/categories/segments", inlineErrorRequest(options.inlineError))
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * HOUR_MS,
    ...inlineErrorQuery(options.inlineError),
  });
  const mapped = useMemo(() => data?.map(withCount), [data]);
  // `isFetching`: "Yeniden dene"den sonra hata satırı yerine dönen simge
  // gösterebilmek için (hata durumundaki sorguda `isLoading` false kalır).
  return { data: mapped, isLoading, isError, isFetching, refetch };
}

/**
 * Bir parent'ın direkt çocukları.
 * - Parent Segment (L1) → çocukları (L2 aileler) `/all` cache'inde, in-memory.
 * - Parent Family/Class (L2/L3) → çocukları (L3/L4) payload optimizasyonu
 *   gereği cache'te DEĞİL → `/children` ile lazy çekilir (düğüm açılınca
 *   tek istek).
 *
 * `parentLevel` ÇAĞIRANDAN gelir, ağaçtan çıkarılmaz — L3 bir düğüm artık
 * `/all` cevabında olmadığı için `tree.find(parentId)` onu bulamaz ve seviye
 * sessizce yanlış hesaplanırdı (emtia listesi boş dönerdi). Üç çağıran da
 * hangi seviyeyi açtığını zaten biliyor.
 */
export function useChildren(
  parentId: string | null | undefined,
  parentLevel: 1 | 2 | 3,
  catalog: CategoryCatalog = "full",
) {
  const {
    data: tree,
    isLoading,
    isError: treeError,
    isFetching: treeFetching,
    refetch: refetchTree,
  } = useCategoryTree();
  const lazyNeeded = parentLevel >= 2;

  // L1 parent → aileler in-memory. Katalog süzgeci GEREKMEZ: aileler (L2) iki
  // katalogda birebir aynı; ayrışma yalnız L4'te.
  //
  // GİZLİ DAL (2026-10-10): görünür bir sektörün gizli ailesi / görünür bir
  // ailenin gizli sınıfı listeye HİÇ girmez (satırı yok → işaretlenemez). API
  // aynı süzgeci uygular; burası ikinci kat (`visibleRows`).
  const memoryChildren = useMemo(() => {
    if (!tree || !parentId || lazyNeeded) return undefined;
    return visibleRows(tree.filter((c) => c.parentId === parentId)).map(withCount);
  }, [tree, parentId, lazyNeeded]);

  // L2/L3 parent → sınıf/emtia lazy. `catalog` query anahtarında ŞART: aksi
  // hâlde firma seçiminde açılan bir sınıfın 13 fazla yaprağı, aynı sınıfı
  // talep formunda açan kullanıcıya önbellekten servis edilirdi.
  // Tek çağıran kategori penceresi; hatayı dalın içinde "Yeniden dene" ile
  // gösterir → genel toast yok, 429'da otomatik tekrar yok (bkz. üstteki not).
  const lazy = useQuery<CategoryNode[]>({
    queryKey: ["category-children", parentId, catalog],
    queryFn: () =>
      api
        .get("/categories/children", {
          params: { parentId, catalog },
          ...inlineErrorRequest(true),
        })
        .then((r) => r.data),
    enabled: !!parentId && lazyNeeded,
    staleTime: FIVE_MIN_MS,
    gcTime: HOUR_MS,
    ...inlineErrorQuery(true),
  });
  const lazyChildren = useMemo(
    () => (lazy.data ? visibleRows(lazy.data).map(withCount) : undefined),
    [lazy.data],
  );

  // `isError` yalnız GÖSTERİLECEK veri yokken: başarısız arka plan tazelemesi
  // eldeki listeyi "yüklenemedi"ye çevirmesin. Boş liste ≠ hata — çağıran
  // ikisini ayrı dallarda çizer. Yeniden deneme sürerken (veri yok + istek
  // yolda) durum "yükleniyor"dur: hata satırı yerine dönen simge görünür.
  if (lazyNeeded) {
    const retrying = lazy.isFetching && lazy.data === undefined;
    return {
      data: lazyChildren,
      isLoading: lazy.isLoading || retrying,
      isError: lazy.isError && lazy.data === undefined && !retrying,
      refetch: lazy.refetch,
    };
  }
  const retrying = treeFetching && tree === undefined;
  return {
    data: memoryChildren,
    isLoading: isLoading || retrying,
    isError: treeError && tree === undefined && !retrying,
    refetch: refetchTree,
  };
}

export interface SearchTreeCommodity {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  isMatch: boolean;
}

export interface SearchTreeClass {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  /** Sınıfın KENDİ adı eşleşti. Seçilebilirliği belirlemez — her sınıf seçilebilir. */
  isMatch: boolean;
  /**
   * Ailesi ya da sektörü eşleştiği için listede (eski API bu alanı vermez).
   * Arayüz buna bakmaz: dönen her sınıf işaretlenebilir satırdır.
   */
  parentMatch?: boolean;
  commodities: SearchTreeCommodity[];
}

export interface SearchTreeFamily {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  /** Ailenin kendisi sorguyla eşleşti (eski API vermez). */
  isMatch?: boolean;
  classes: SearchTreeClass[];
}

export interface SearchTreeSegment {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  /** Ariba'nın iç segment harfi — arayüzde GÖSTERİLMEZ. */
  segmentLetter: string | null;
  /** Sektörün kendi adı sorguyla eşleşti (eski API vermez). */
  isMatch?: boolean;
  families: SearchTreeFamily[];
}

/**
 * Hiyerarşik arama — eşleşenleri parent path'leri ile tree olarak döner.
 * Modal'da PratisPro tarzı tree render için. Min 2 char (backend enforce).
 */
export function useCategorySearchTree(
  query: string,
  catalog: CategoryCatalog = "full",
  options: CategoryQueryOptions = {},
) {
  const trimmed = query.trim();
  return useQuery<{ segments: SearchTreeSegment[]; truncated?: boolean }>({
    queryKey: ["category-search-tree", trimmed, catalog],
    queryFn: () =>
      api
        .get("/categories/search-tree", {
          params: { q: trimmed, catalog },
          ...inlineErrorRequest(options.inlineError),
        })
        .then((r) => r.data),
    enabled: trimmed.length >= 2,
    staleTime: FIVE_MIN_MS,
    select: visibleSearchTree,
    ...inlineErrorQuery(options.inlineError),
  });
}

type SearchTreeResult = { segments: SearchTreeSegment[]; truncated?: boolean };

/**
 * Arama ağacından gizli dalları budar (2026-10-10): gizli sektör, görünür
 * sektörün gizli ailesi, görünür ailenin gizli sınıfı ve altındaki emtialar.
 * API aynı süzgeci uygular; burası ikinci kat — pencere ve kalem adından öneri
 * (`CategorySuggest`) aynı kancayı okur. Gizli satır yoksa AYNI nesne döner.
 *
 * BUDAMANIN BOŞALTTIĞI ATA DA DÜŞER: sonuçta yalnız gizli torunu eşleştiği
 * için bulunan görünür aile / sektör ("silah" → 4618 → 461825) altı boş bir
 * satır olarak kalmaz — sektörün de işaretlenebildiği firma penceresinde
 * "silah" araması "İş Güvenliği ve Yangın Ekipmanları"nı sonuç diye çizerdi.
 * KENDİ adı eşleşen (`isMatch`) ata kalır; altı baştan boş gelen satıra
 * dokunulmaz (onu budama boşaltmadı).
 */
function visibleSearchTree(res: SearchTreeResult): SearchTreeResult {
  const anyHidden = (res.segments ?? []).some(
    (s) =>
      isHiddenCategory(s.id) ||
      s.families.some(
        (f) =>
          isHiddenCategory(f.id) ||
          f.classes.some((c) => isHiddenCategory(c.id) || c.commodities.some((m) => isHiddenCategory(m.id))),
      ),
  );
  if (!anyHidden) return res;
  const segments: SearchTreeSegment[] = [];
  for (const s of visibleRows(res.segments)) {
    const families: SearchTreeFamily[] = [];
    for (const f of visibleRows(s.families)) {
      const classes = visibleRows(f.classes).map((c) => ({ ...c, commodities: visibleRows(c.commodities) }));
      if (classes.length === 0 && f.classes.length > 0 && !f.isMatch) continue;
      families.push({ ...f, classes });
    }
    if (families.length === 0 && s.families.length > 0 && !s.isMatch) continue;
    segments.push({ ...s, families });
  }
  return { ...res, segments };
}

/**
 * Seçili ID'lerin breadcrumb bilgisi (chip listesi için).
 *
 * V2-6.5 fix — Hızlı seçim ekleme/çıkarmada chip listesinde loading flicker
 * ve uzun süreli "yükleniyor" hissini önlemek için:
 *   - placeholderData: önceki cevap korunur, yeni fetch arka planda
 *   - gcTime: HOUR_MS — cache entry'leri çabuk düşmesin
 *
 * GİZLİ KATEGORİ (2026-10-09, sahip kararı: "anasayfada olmayan kategori başka
 * yerde de gösterilmesin"; 2026-10-10: kuralın birimi kod ÖNEKİ — gizli sektör,
 * görünür sektörün gizli ailesi, görünür ailenin gizli sınıfı): gizli bir
 * önekin altındaki kod bu kancadan AD
 * ALAMAZ — istek ona hiç sorulmaz (`visibleCategoryIds`) ve cevapta gelse de
 * düşer (`select`; eski API ya da önbellekteki cevap). Yani eski bir kayıttaki
 * gizli kod için DÖNEN SATIR YOKTUR; satırı olmayan kimliği çizen tüketici
 * (çip, kırıntı, sayaç) onu hiç çizmemelidir — ham kod ya da bitmeyen
 * "yükleniyor" çipi göstermek aynı kuralın ihlalidir. Yardımcı:
 * `resolvedCategoryIds` (`@/lib/visible-categories`).
 */
export function useCategoriesByIds(
  ids: string[],
  options: CategoryQueryOptions = {},
) {
  const visible = visibleCategoryIds(ids);
  const key = [...visible].sort().join(",");
  return useQuery<CategoryWithBreadcrumb[]>({
    queryKey: ["category-by-ids", key],
    queryFn: () => {
      if (visible.length === 0) return Promise.resolve([]);
      return api
        .get("/categories/by-ids", {
          params: { ids: visible.join(",") },
          ...inlineErrorRequest(options.inlineError),
        })
        .then((r) => r.data);
    },
    enabled: visible.length > 0,
    staleTime: FIVE_MIN_MS,
    gcTime: HOUR_MS,
    placeholderData: (prev) => prev,
    select: visibleRows,
    ...inlineErrorQuery(options.inlineError),
  });
}

/**
 * Gizli bir önekin (sektör, aile ya da sınıf) altındaki satırlar düşer; gizli
 * satır yoksa AYNI dizi döner. `select` kimliği sabit kalsın diye modül
 * düzeyinde (her çizimde yeni işlev = her çizimde yeniden seçim).
 */
function visibleRows<T extends { id: string }>(rows: T[]): T[] {
  return rows.some((r) => isHiddenCategory(r.id)) ? rows.filter((r) => !isHiddenCategory(r.id)) : rows;
}

