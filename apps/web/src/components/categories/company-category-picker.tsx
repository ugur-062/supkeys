"use client";

import { useTranslations } from "next-intl";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  MAX_COMPANY_SUB_PICKS,
  categoryLevel,
  categorySegment,
  deepestCategoryPicks,
  expandCompanyCategorySelection,
  removeCategoryBranch,
  visibleCategoryIds,
} from "@rothern/shared";
import { Layers, Plus, Tag, X as XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCategoriesByIds, useRoots } from "@/hooks/use-categories";
import { resolvedCategoryIds } from "@/lib/visible-categories";
import { plainBreadcrumb } from "./category-breadcrumb";
import { sameIdSet } from "./category-dialog-shell";
import { LoadError } from "./category-load-error";

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
 * Yeni kümeyi KAYITLI SIRAYLA verir: zaten kayıtlı kodlar yerinde kalır, yeni
 * gelenler sona eklenir.
 *
 * Türetme (`expandCompanyCategorySelection`) zinciri seçim sırasıyla yeniden
 * kurar. Sıra korunmazsa tek bir çip eklemek/kaldırmak sektör kartlarının
 * yerini değiştirir; Ayarlar formu da dizileri sıralı karşılaştırdığı için
 * yalnız sırası değişen beyan "değişti" sayılır.
 */
function kayitliSirayla(
  kayitli: readonly string[],
  yeni: readonly string[],
): string[] {
  const kalan = new Set(yeni);
  return [...new Set([...kayitli.filter((id) => kalan.has(id)), ...yeni])];
}

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
 * SEKTÖRÜN TAMAMI — AYNI PENCEREDE (2026-10-08, kullanıcı: "üst başlıktan
 * seçemiyorlar"). Bir sektörün tamamında çalışan firma yaprak saymak zorunda
 * kalmasın diye sektörün kendisi de beyan edilebilir; o sektörün altı boş
 * kalır — bilinçli: "bu alanda her şeyi yaparım". Eskiden bu, sayfadaki ayrı
 * bir "Sektör geneli ekle" bağlantısının açtığı İKİNCİ pencereden yapılıyordu
 * ve ağaçtaki sektör satırı yalnız aç/kapa başlığıydı: kullanıcı en doğal
 * yerde (başlıkta) işaret arıyor, bulamıyordu. Artık tek pencere var ve her
 * seviye işaretlenir: sektör (= tamamı), aile, sınıf, emtia.
 *
 * DEĞER SÖZLEŞMESİ DEĞİŞMEDİ (API de aynı şekli alır, depoda ayrı işaret yok):
 * "sektörün tamamı" = sektör kodu `mainIds`te ve o sektörden HİÇBİR kod
 * `subIds`te yok. Altında kayıt olan sektör türetilmiştir. Pencereye giden
 * seçim kümesi bu kuraldan okunur (`pencereDegeri`), dönen küme
 * `expandCompanyCategorySelection` ile aynı şekle çevrilir.
 *
 * EKLE/ÇIKAR KURALI (belirsizlik bırakmamak için):
 *  · seçim eklenince ata zinciri (L2/L3/L4) ve segmenti KENDİLİĞİNDEN belirir
 *  · seçim silinince zinciri de gider; o segmentte başka seçim kalmadıysa
 *    SEGMENT DE düşer — aksi hâlde firma tek yaprağı sildikten sonra sessizce
 *    segmentin TAMAMINDAN bildirim almaya başlardı (çözmeye çalıştığımız
 *    arızanın ta kendisi)
 *  · segment silinince ALTINDAKİLER DE gider (zincirleme) — "artık bu alanda
 *    değilim" demenin tek ve net yolu
 *  · bir dalda TEK seçim: sektör işaretlenince altındaki seçimler, altından
 *    bir öğe işaretlenince sektör işareti düşer (pencere bunu söyler)
 *
 * BİLİNÇLİ TAVİZ: tamamı beyan edilmiş bir sektörün altından sonradan öğe
 * seçilir ve o öğe silinirse, sektör de düşer (kaydı provenance tutmuyoruz).
 * Tek tık ile geri eklenebilir; ters tercih ise sessiz genişleme üretirdi.
 *
 * TAVANLAR: en fazla `MAX_COMPANY_MAIN_CATEGORIES` sektör (tamamı beyan
 * edilenler + diğer seçimlerin sektörleri) ve sektör ALTINDA en fazla
 * `MAX_COMPANY_SUB_PICKS` seçim. Pencere ikisini ayrı sayaçla gösterir ve
 * aşacak işareti reddeder; `dogrula` onay anındaki son denetimdir.
 *
 * GİZLİ SEKTÖR (2026-10-09, sahip kararı: "anasayfada olmayan kategori başka
 * yerde de gösterilmesin"): sektör gizlenmeden önce kaydedilmiş beyan kodu
 * (`HIDDEN_SEGMENTS`) bu bileşende YOK SAYILIR — kartı çizilmez, pencereye
 * gitmez, sektör/seçim tavanına sayılmaz, adı sorulmaz. Seçici dokunulan
 * ekseni gördüğünden yeniden kurduğu için o eksen kaydedilince gizli kodlar
 * depodan da düşer (API aynı kuralı uygular). Dokunulmayan eksen gönderilmez;
 * eşleştirme o zamana dek kayıtlı kodları kullanmayı sürdürür. Yalnız gizli
 * kodu olan beyan boş durumla açılır. (2026-10-08'e dek gizli sektörün adı
 * `by-ids` yedeğinden okunup kart olarak çiziliyordu.)
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
  const [open, setOpen] = useState(false);
  const [uyari, setUyari] = useState<string | null>(null);
  const hataId = useId();

  // Sektör listesi düşerse ad `by-ids` yedeğinden okunur (aşağıda), pencere de
  // hatayı kendi içinde çizer → genel toast ve 429'da otomatik tekrar yok.
  const { data: segments } = useRoots({ inlineError: true });
  /** Beyanın GÖRÜNÜR kısmı — bileşenin geri kalanı yalnız bunu okur (bkz. başlık notu). */
  const mainIds = useMemo(() => visibleCategoryIds(value.mainIds), [value.mainIds]);
  const subIds = useMemo(() => visibleCategoryIds(value.subIds), [value.subIds]);
  /**
   * Depoda ata zinciri de duruyor (L2+L3+L4). Ekranda yalnız KULLANICININ
   * seçtikleri çizilir — türetilmiş üst seviyeler ayrı çip olsaydı tek seçim
   * üç çipe dönüşür ve 50'lik tavan anlamsızlaşırdı. Zincir, çipin
   * breadcrumb'ında zaten okunuyor.
   */
  const secilenler = useMemo(() => deepestCategoryPicks(subIds), [subIds]);
  /**
   * Adlar TEK istekle: seçimler + sektörlerin kendisi. Sektör adı önce
   * `segments`ten okunur; aynı istek sektör listesi yüklenirken/düşmüşken de
   * adı verir. Gizli sektörün kodu burada yoktur (yukarıda düştü).
   */
  const adIds = useMemo(
    () => [...new Set([...secilenler, ...mainIds])],
    [secilenler, mainIds],
  );
  const adlar = useCategoriesByIds(adIds, { inlineError: true });
  const subCats = adlar.data;
  /**
   * Ad isteği düştü — "…" kalıcı görünmesin; kod + "Yeniden dene". Yeniden
   * deneme yoldayken hata sayılmaz (çipler "…" gösterir).
   */
  const adlarHata = !!adlar.isError && !adlar.isFetching;
  const renk = ACCENT[accent];

  const adById = useMemo(
    () => new Map((subCats ?? []).map((c) => [c.id, c])),
    [subCats],
  );
  /** Ad isteği yolda: cevap yok ya da eldeki cevap önceki seçimin (placeholder). */
  const adlarBekliyor =
    !adlarHata && (subCats === undefined || !!adlar.isPlaceholderData);
  /** Adı henüz gelmemiş kod: yükleniyorsa "…", istek düştüyse KOD. */
  const adYedegi = (id: string) => (adlarBekliyor ? "…" : id);
  /**
   * Ad cevabı GELDİYSE satırı olmayan seçim çizilmez (katalogda artık olmayan
   * kod): "…" çipi sonsuza dek asılı kalmasın, ham kod da basılmasın. Cevap
   * yoksa (yükleniyor / düştü) hepsi yerinde — "…" ya da kod + "Yeniden dene".
   */
  const cizilenSecimler = (ids: string[]) =>
    adlarBekliyor || adlarHata ? ids : resolvedCategoryIds(ids, subCats);

  const segmentAdlari = useMemo(
    () => new Map((segments ?? []).map((s) => [s.id, s.nameTr])),
    [segments],
  );
  /** Sektörün bilinen adı (yoksa null) — liste, sonra `by-ids`. */
  const segmentAdiBilinen = (id: string) =>
    segmentAdlari.get(id) ?? adById.get(id)?.nameTr ?? null;

  /**
   * Sektör → kullanıcının o sektörde seçtikleri. Altı BOŞ grup = sektörün
   * tamamı beyan edilmiş (değer sözleşmesi: `mainIds`te var, `subIds`te o
   * sektörden kod yok).
   *
   * Yalnız KODLAR — adlar çizimde eklenir. Adlara bağlı olsaydı ad isteği her
   * yanıtlandığında bu dizi (ve ondan türeyen `pencereDegeri`) yeniden
   * kurulur, açık pencere taslağını kayıtlı değere sıfırlardı.
   */
  const gruplar = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const id of mainIds) map.set(id, []);
    for (const id of secilenler) {
      const seg = categorySegment(id);
      if (!seg) continue;
      if (!map.has(seg)) map.set(seg, []);
      map.get(seg)!.push(id);
    }
    return [...map.entries()];
  }, [mainIds, secilenler]);

  /**
   * Pencereye giden seçim kümesi — kartlarla AYNI içerik ve sıra: sektörün
   * tamamı beyan edildiyse sektör kodu, değilse o sektördeki seçimler.
   */
  const pencereDegeri = useMemo(
    () => gruplar.flatMap(([seg, secimler]) => (secimler.length > 0 ? secimler : [seg])),
    [gruplar],
  );

  // Yalnız gizli sektör kodu taşıyan eski beyan da BOŞ durumdur.
  const bos = mainIds.length === 0 && subIds.length === 0;

  /**
   * Bir seçim/sektör kaldırılınca düğmesi DOM'dan gider ve odak <body>'ye
   * düşer (klavye kullanıcısı yerini kaybeder). Odak kaybolduysa ekleme
   * düğmesine — hiç seçim kalmadıysa boş durum düğmesine — taşınır.
   *
   * YALNIZ KLAVYE tetiklemesinde (`detail` 0 — penceredeki çip kuralıyla aynı):
   * `focus()` hedefi görünüme kaydırır; fare/dokunmada her kaldırma sayfayı
   * listenin sonuna atıyordu (360×640'ta 24 seçimde scrollY 0 → 660), baştan
   * birkaç seçim kaldıran kullanıcı her seferinde geri kaydırmak zorundaydı.
   */
  const ekleRef = useRef<HTMLButtonElement>(null);
  const bosRef = useRef<HTMLButtonElement>(null);
  const odakGeriAl = useRef(false);
  useEffect(() => {
    if (!odakGeriAl.current) return;
    odakGeriAl.current = false;
    const aktif = document.activeElement;
    if (aktif && aktif !== document.body) return;
    (ekleRef.current ?? bosRef.current)?.focus();
  }, [value]);

  /**
   * Seçim kümesini depolanan değere çevirir. Küme penceredekiyle aynı şeydir:
   * tamamı beyan edilen sektörlerin kodu + diğer dallardaki en derin kodlar.
   * Sektör kodu ana eksene yazılır ve altı boş kalır; diğer kodların ata
   * zinciri (L2+L3+L4) beyana DAHİL edilir, sektörleri ana eksene türetilir.
   *
   * Zincir neden şart: eşleştirme ata zincirini TALEBİN kodundan yukarı
   * çıkarıyor, firmanın beyanından aşağı inmiyor. Yaprak tek başına
   * saklansaydı, alıcı bir üst seviyede (L3) talep açtığında dar eksen tutmaz
   * ve firma geniş eksene düşerdi — yani daralttığını sanırken segmentin
   * tamamından bildirim alırdı.
   */
  const genislet = (ids: readonly string[]): CompanyCategoryValue => {
    const sonraki = expandCompanyCategorySelection(ids);
    return {
      mainIds: kayitliSirayla(mainIds, sonraki.mainIds),
      subIds: kayitliSirayla(subIds, sonraki.subIds),
    };
  };

  /**
   * Tavan denetimi — modal `validate` olarak da çağırır: reddedilirse modal
   * AÇIK kalır, taslak kaybolmaz (eskiden modal kapanıyor, açınca taslak eski
   * değere sıfırlanıyordu — derin denetim 2026-09-29). Pencere tavanı aşacak
   * işareti zaten reddeder; burası onay anındaki son denetim.
   */
  const dogrula = (ids: string[]): string | null => {
    // Sektör işareti ürün/hizmet DEĞİLDİR: 50'lik tavan sektör altındaki
    // seçimleri sayar.
    const altSecim = ids.filter((id) => categoryLevel(id) !== 1).length;
    if (altSecim > MAX_COMPANY_SUB_PICKS) {
      return t("enFazlaUrunHizmetSecebilirsiniz", { max: MAX_COMPANY_SUB_PICKS });
    }
    const { mainIds } = expandCompanyCategorySelection(ids);
    if (mainIds.length > MAX_COMPANY_MAIN_CATEGORIES) {
      // Sessizce kırpmak yerine söylüyoruz: hangi seçimin düştüğünü kullanıcı
      // göremezse beyanı eksik kalır ve bunu asla fark etmez.
      return t("secimlerinizAyriSektoreYayiliyorEn", { n: mainIds.length, max: MAX_COMPANY_MAIN_CATEGORIES });
    }
    return null;
  };

  const onayla = (ids: string[]) => {
    const hata = dogrula(ids);
    if (hata) {
      setUyari(hata);
      return;
    }
    setUyari(null);
    // Seçim kümesi aynıysa beyan da aynıdır: pencereyi hiçbir şeye dokunmadan
    // onaylamak `onChange` üretmez (Ayarlar'da form kirlenip "Kaydet" açılıyor,
    // sayfadan çıkış uyarısı çıkıyordu).
    if (sameIdSet(ids, pencereDegeri)) return;
    onChange(genislet(ids));
  };

  /**
   * Bir seçimi kaldır. Ata zinciri de saklandığı için yalnız kodun kendisini
   * silmek YETMEZ — L3/L2 kayıtları kalsaydı firma sildiğini sandığı daldan
   * bildirim almaya devam ederdi. Kardeş seçimlerin ihtiyaç duyduğu atalar
   * yeniden kurulur; tamamı beyan edilmiş diğer sektörler kümede durur.
   */
  const altSil = (id: string, klavyeyle: boolean) => {
    odakGeriAl.current = klavyeyle;
    onChange(genislet(pencereDegeri.filter((x) => x !== id)));
  };

  /** Segment silinince altındaki her şey gider — zincirleme. */
  const segmentSil = (seg: string, klavyeyle: boolean) => {
    odakGeriAl.current = klavyeyle;
    onChange({
      mainIds: mainIds.filter((x) => x !== seg),
      subIds: removeCategoryBranch(subIds, seg),
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
          ref={bosRef}
          type="button"
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          aria-describedby={error ? hataId : undefined}
          className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? "border-rose-300 bg-rose-50 hover:bg-rose-100"
              : "border-zinc-300 bg-white hover:border-zinc-400"
          }`}
        >
          {/* `min-w-0` + `shrink-0`: ipucu iki satıra sarılır, ikonlar ezilmez
              ve kutu 360 px'te (RU dahil) taşmaz. */}
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                error ? "bg-rose-100" : "bg-zinc-100"
              }`}
            >
              <Tag
                className={`h-4 w-4 ${error ? "text-rose-600" : "text-zinc-600"}`}
              />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-zinc-900">
                {t("urunHizmetSecin")}
              </span>
              {/* Sektörün tamamı da AYNI pencereden seçilir — ayrı bağlantı yok. */}
              <span className="mt-0.5 block text-xs break-words text-zinc-500">
                {t("sektorunTamaminiDaSecebilirsiniz")}
              </span>
            </span>
          </span>
          <Plus className="h-4 w-4 shrink-0 text-zinc-500" />
        </button>
      ) : (
        <ul className="space-y-2">
          {gruplar.map(([seg, secimler]) => {
            const segAd = segmentAdiBilinen(seg);
            const cizilen = cizilenSecimler(secimler);
            // Çizilecek hiçbir şeyi kalmayan kart açılmaz: bütün seçimleri
            // katalogdan düşmüş sektör ya da adı hiçbir kaynaktan çözülemeyen
            // (katalogda olmayan) sektör kodu — başlıksız/ham kodlu kutu yok.
            const cozuldu = !adlarBekliyor && !adlarHata;
            if (secimler.length > 0 ? cizilen.length === 0 : cozuldu && !segAd) return null;
            return (
              <li
                key={seg}
                className="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${renk.chip}`}
                  >
                    {/* `shrink-0`: ad sarılınca ikon 4-10 px'e eziliyordu. */}
                    <Layers className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">
                      {segAd ?? adYedegi(seg)}
                    </span>
                  </span>
                  {!disabled ? (
                    // Dokunma hedefi 32 px; eksi kenar boşluğu kartı büyütmez.
                    <button
                      type="button"
                      // Klavye tetiklemesinde `detail` 0'dır.
                      onClick={(e) => segmentSil(seg, e.detail === 0)}
                      aria-label={t("sektorunuVeAltindakiSecimleriKaldir", { segmentAdi: segAd ?? seg })}
                      className="-m-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-rose-600 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900"
                    >
                      <XIcon className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                {secimler.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cizilen.map((id) => {
                      const c = adById.get(id);
                      const ad = c?.nameTr ?? null;
                      // Breadcrumb: zincirin tamamı burada okunuyor, ayrı çipe
                      // gerek yok. Baştaki segment harfi ("P. ") iç koddur,
                      // gösterilmez.
                      const yol = plainBreadcrumb(c?.breadcrumb);
                      return (
                        <span
                          key={id}
                          /* Yol tooltip'te: kullanıcı yaprağı seçti, hangi sınıfın
                             altında olduğunu (ve dolayısıyla neyle eşleşeceğini)
                             görebilmeli. */
                          title={yol || ad || undefined}
                          /* `max-w-full min-w-0`: çip kartın içinde kalır (sabit
                             220 px tavanla 360 px'te kartın 15 px dışına çıkıyordu). */
                          className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                        >
                          {/* Adın TAMAMI — uzun ad kesilmez, sarılır. */}
                          <span className="min-w-0 break-words">
                            {ad ?? adYedegi(id)}
                          </span>
                          {!disabled ? (
                            <button
                              type="button"
                              onClick={(e) => altSil(id, e.detail === 0)}
                              aria-label={t("seciminiKaldir", { ad: ad ?? id })}
                              className="-my-2 -mr-2 -ml-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-rose-600 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-zinc-900"
                            >
                              <XIcon className="h-3 w-3" aria-hidden />
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  // Altı boş sektör = sektörün tamamı beyan edildi.
                  <p className="mt-2 text-xs break-words text-zinc-600">
                    {t("sektorunTamami")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!bos && adlarHata ? (
        <LoadError
          compact
          message={t("secimAdlariYuklenemedi")}
          retryLabel={t("yenidenDene")}
          onRetry={() => void adlar.refetch?.()}
        />
      ) : null}

      {/* TEK ekleme düğmesi: sektörün tamamı da aynı pencereden seçilir (ayrı
          "Sektör geneli ekle" bağlantısı kalktı); yanındaki ipucu bunu söyler.
          Boşken birincil eylem zaten yukarıdaki kesikli kutu ve ipucu onun
          içinde — burada tekrarlamak iki özdeş düğme bırakırdı. */}
      {!disabled && !bos ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          {/* Metin eylemi en az 32 px yüksek (dokunma hedefi; 16-20 px idi). */}
          <button
            ref={ekleRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-describedby={error ? hataId : undefined}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 text-sm font-semibold text-zinc-700 hover:text-zinc-900"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("urunHizmetEkle")}
          </button>
          <span className="min-w-0 text-xs break-words text-zinc-500">
            {t("sektorunTamaminiDaSecebilirsiniz")}
          </span>
        </div>
      ) : null}

      {uyari ? (
        <p role="alert" className="mt-1.5 text-xs text-amber-700">
          {uyari}
        </p>
      ) : null}
      {/* Zorunlu alan / sunucu reddi. `role="alert"`: belirdiği an okunur (odak
          nereye giderse gitsin); `id`: seçimi açan düğmelerin erişilebilir
          açıklaması — "Devam"dan sonra odak bu düğmeye taşındığında ekran
          okuyucu yalnız düğmeyi okuyor, hata görünür ama söylenmiyordu. */}
      {error ? (
        <p id={hataId} role="alert" className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : null}

      {/* Koşullu mount: modal gövdesi açılmadan koşarsa katalog sorgusunu
          kullanıcı hiç dokunmadan tetikler (P-4'te ölçülen tuzak). */}
      {open ? (
        <CategorySelectorModal
          isOpen={open}
          onClose={() => setOpen(false)}
          value={pencereDegeri}
          onConfirm={onayla}
          validate={dogrula}
          mode="multi"
          // İki tavan: sektör ALTINDA 50 seçim + en fazla 5 sektör.
          maxSelection={MAX_COMPANY_SUB_PICKS}
          maxSectors={MAX_COMPANY_MAIN_CATEGORIES}
          title={modalTitle}
          description={t("sektorunTamaminiYaDaAltindaki")}
          catalog="full"
          // Firma beyanı L1-L4: sektör (= tamamı), aile, sınıf, emtia — hepsi
          // tek pencerede işaretlenir (talep formu L3+ kalır).
          minSelectableLevel={1}
          // Depo ve gösterim dal başına tek (en derin) kodu tutar; taslak da öyle.
          singlePickPerBranch
          // Ekran bunlara "ürün / hizmet" diyor; uyarı da öyle desin.
          limitMessage={t("enFazlaUrunHizmetSecebilirsiniz", {
            max: MAX_COMPANY_SUB_PICKS,
          })}
        />
      ) : null}
    </div>
  );
}
