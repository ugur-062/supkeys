"use client";

import { useTranslations } from "next-intl";
import { MAX_COMPANY_MAIN_CATEGORIES } from "@rothern/shared";
import { Layers, Pencil, Plus, Tag, X as XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCategoriesByIds, useRoots } from "@/hooks/use-categories";
import { declaredSectors, sectorsOf } from "@/lib/company/declared-sectors";
import { sameIdSet } from "./category-dialog-shell";
import { LoadError } from "./category-load-error";

// Modal 1000+ satır — kullanıcı açana kadar bundle'a girmesin (P-4 kalıbı).
const CategorySelectorModal = dynamic(
  () => import("./category-selector-modal").then((m) => m.CategorySelectorModal),
  { ssr: false },
);

export interface CompanyCategoryValue {
  /** Sektörler (L1) — beyanın tamamı. */
  mainIds: string[];
  /**
   * Eski ürün / hizmet seçimleri (L2-4). Seçici bunları YAZMAZ: her
   * değişiklikte boş döner (bkz. başlık notu); yalnız eski kaydın sektörünü
   * bulmak için okunur.
   */
  subIds: string[];
}

interface Props {
  value: CompanyCategoryValue;
  onChange: (next: CompanyCategoryValue) => void;
  /** Bölüm başlığı: "Ne satarım", "Ne alırım", "Sektörleriniz". */
  label: string;
  /** Başlığın altındaki tek cümlelik gerekçe. */
  hint: string;
  /** Modal başlığı — hangi eksende olduğumuzu modal içinde de söyler. */
  modalTitle: string;
  /**
   * Modalın tek cümlelik açıklaması. Verilmezse alış + satış BİRLİKTE (kayıt
   * beyanı: "Alıp sattığınız ürün ve hizmetlerin sektörleri"). Tek eksenli
   * çağıran (Ayarlar › Ne alırım / Ne satarım) kendi cümlesini verir — alış
   * ekseni "faaliyet gösterdiğiniz" sektör değil, SATIN ALDIKLARINIZIN
   * sektörüdür (hastane tıbbi cihaz alır, o sektörde çalışmaz).
   */
  modalDescription?: string;
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
 * Yeni kümeyi KAYITLI SIRAYLA verir: zaten kayıtlı sektörler yerinde kalır,
 * yeni gelenler sona eklenir. Sıra korunmazsa tek bir sektör eklemek çiplerin
 * yerini değiştirir.
 */
function kayitliSirayla(
  kayitli: readonly string[],
  yeni: readonly string[],
): string[] {
  const kalan = new Set(yeni);
  return [...new Set([...kayitli.filter((id) => kalan.has(id)), ...yeni])];
}

/**
 * FİRMA KATEGORİ BEYANI — YALNIZ SEKTÖR (sahip kararı 2026-10-29).
 *
 * NE DEĞİŞTİ: kayıt 2. adımı ("Faaliyet alanı") ve Ayarlar › Firma Bilgileri ›
 * Kategoriler ("Ne alırım / Ne satarım") artık yalnız SEKTÖR (L1) sorar;
 * eksen başına en fazla `MAX_COMPANY_MAIN_CATEGORIES`. 2026-10-08'den beri
 * aynı pencerede sektörün tamamı ya da altındaki ürün / hizmet (L2-L4, en
 * fazla 50) işaretleniyordu; ürün / hizmet seçimi bu pencereden KALKTI. Firmanın
 * ne sattığının asıl kaynağı vitrindeki ürünlerdir (ürün formunun kategorisi);
 * beyanda ikinci kez sorulmaz. Talep ve ürün formlarının kategori seçicileri
 * (en az L3) DEĞİŞMEDİ.
 *
 * ARAMA KALIR: kullanıcı ne sattığını bilir ("çelik boru"), sektör adını
 * bilmez. Pencere (`sectorsOnly`) aramayı bağlamıyla gösterir; işaret sonucun
 * SEKTÖRÜNE konur.
 *
 * DEĞER SÖZLEŞMESİ (API aynı şekli alır, depoda ayrı işaret yok):
 *  · `mainIds` = beyan edilen sektörler; sıra kayıtlı sıradır, yeniler sona.
 *  · `subIds` her değişiklikte BOŞ döner. Mevcut firmaların alt seçimleri
 *    ayrı bir temizlik betiğiyle silinir, API de yeni alt seçim saklamaz
 *    (eski istemciden gelen alt dizi sektörüne normalize edilip `[]` yazılır).
 *    Seçici `[]`ı bilinçli döner: Ayarlar'da sektör kaldırılınca eksenin alt
 *    listesi de `[]` olarak gider — gönderilmeseydi API eksik yarıyı depodaki
 *    eski alt seçimlerden doldurup kaldırılan sektörü geri getirebilirdi.
 *  · Okurken eski kayıt da doğru okunur (`declaredSectors`): alt seçimin
 *    sektörü zaten ana eksende durur (API normalize eder); durmuyorsa da
 *    alt seçimden türetilip sektör olarak gösterilir. Değişmeyen beyan
 *    `onChange` üretmez (pencereyi dokunmadan onaylamak formu kirletmez).
 *
 * TAVAN: en fazla `MAX_COMPANY_MAIN_CATEGORIES` sektör. Pencere aşacak işareti
 * reddeder ve sayacı "Sektör n/max" gösterir; `dogrula` onay anındaki son
 * denetimdir (tavanın üstünde kayıtlı eski beyan — Ayarlar eskiden 10 sektöre
 * izin veriyordu — azaltılmadan onaylanamaz). Tavandayken düğme "Sektörleri
 * düzenle" der (pencere ekletmez, değiştirtir); tavanın üstündeki eski beyan
 * pencere açılmadan çiplerin altında söylenir.
 *
 * GİZLİ KATEGORİ (2026-10-09 / 2026-10-10, sahip kararı: "anasayfada olmayan
 * kategori başka yerde de gösterilmesin"): gizli kod çizilmez, pencereye
 * gitmez, tavana sayılmaz, adı sorulmaz. Beyan seçimi ata zinciriyle sakladığı
 * için yalnız gizli bir seçimin atası olarak saklanmış görünür sektör de
 * (46 "İş Güvenliği ve Yangın Ekipmanları" altındaki silah / kolluk dalı)
 * düşer — eksenin iki dizisi BİRLİKTE okunur (`visibleCompanyCategorySelection`,
 * `declaredSectors` içinde). Seçici dokunulan ekseni görünür sektörlerden
 * yeniden kurduğu için o eksen kaydedilince gizli kodlar depodan da düşer.
 */
export function CompanyCategoryPicker({
  value,
  onChange,
  label,
  hint,
  modalTitle,
  modalDescription,
  accent = "zinc",
  disabled,
  error,
}: Props) {
  const t = useTranslations("web.shared.companyCategoryPicker");
  const [open, setOpen] = useState(false);
  const hataId = useId();
  const tavanId = useId();

  // Sektör listesi düşerse ad `by-ids` yedeğinden okunur (aşağıda), pencere de
  // hatayı kendi içinde çizer → genel toast ve 429'da otomatik tekrar yok.
  const { data: segments } = useRoots({ inlineError: true });
  /**
   * Beyanın GÖRÜNÜR sektörleri — bileşenin geri kalanı yalnız bunu okur.
   * Yalnız KODLARA bağlı (adlara değil): pencere `value` her değiştiğinde
   * taslağını sıfırlar; ad isteği yanıtlandığında yeni bir dizi doğsaydı
   * kullanıcının penceredeki işaretleri silinirdi.
   */
  const sektorler = useMemo(
    () => declaredSectors(value.mainIds, value.subIds),
    [value.mainIds, value.subIds],
  );
  /**
   * Adlar sektör listesinden; aynı kodlar `by-ids` ile de istenir (liste
   * yüklenirken / düşmüşken ad yine gelsin). Kayıt sihirbazının özeti AYNI
   * id listesi ve AYNI seçenekle ister → sorgu anahtarı ortaktır.
   */
  const adlar = useCategoriesByIds(sektorler, { inlineError: true });
  const adCevabi = adlar.data;
  /**
   * Ad isteği düştü — "…" kalıcı görünmesin; kod + "Yeniden dene". Yeniden
   * deneme yoldayken hata sayılmaz (çipler "…" gösterir).
   */
  const adlarHata = !!adlar.isError && !adlar.isFetching;
  const renk = ACCENT[accent];

  const adById = useMemo(
    () => new Map((adCevabi ?? []).map((c) => [c.id, c.nameTr])),
    [adCevabi],
  );
  const segmentAdlari = useMemo(
    () => new Map((segments ?? []).map((s) => [s.id, s.nameTr])),
    [segments],
  );
  /** Ad isteği yolda: cevap yok ya da eldeki cevap önceki seçimin (placeholder). */
  const adlarBekliyor =
    !adlarHata && (adCevabi === undefined || !!adlar.isPlaceholderData);
  /** Sektörün bilinen adı (yoksa null) — liste, sonra `by-ids`. */
  const sektorAdi = (id: string) => segmentAdlari.get(id) ?? adById.get(id) ?? null;
  /** Adı henüz gelmemiş kod: yükleniyorsa "…", istek düştüyse KOD. */
  const adYedegi = (id: string) => (adlarBekliyor ? "…" : id);
  /**
   * Ad cevabı GELDİYSE adı hiçbir kaynaktan çözülemeyen sektör (katalogda
   * artık olmayan kod) çizilmez: "…" çipi asılı kalmasın, ham kod basılmasın.
   * Cevap yoksa (yükleniyor / düştü) hepsi yerinde — "…" ya da kod.
   */
  const cozuldu = !adlarBekliyor && !adlarHata;
  const cizilenler = cozuldu ? sektorler.filter((id) => sektorAdi(id) !== null) : sektorler;

  // Yalnız gizli kod (ve onun ata zinciri) taşıyan eski beyan da BOŞ durumdur.
  const bos = sektorler.length === 0;
  /**
   * Tavanda pencere yeni sektör eklemez, yalnız değiştirir (birini kaldırıp
   * başkasını işaretlemek) → düğme "Sektör ekle" değil "Sektörleri düzenle".
   */
  const tavanda = sektorler.length >= MAX_COMPANY_MAIN_CATEGORIES;
  /**
   * Tavanın ÜSTÜNDE kayıtlı eski beyan (Ayarlar eskiden 10 sektöre izin
   * veriyordu): pencere açılmadan, çiplerin altında söylenir — çipten × ile
   * kaldırmak pencereden geçmez, kullanıcı fazlayı ancak kaydederken API
   * reddinden öğrenirdi. Sayı kaldırdıkça güncellenir; tavana inince kaybolur.
   * Çağıranın hatası (zorunlu alan / sunucu reddi / Ayarlar'ın kayıt kapısı)
   * varken o yazılır, ikisi üst üste binmez.
   */
  const tavanUstu =
    sektorler.length > MAX_COMPANY_MAIN_CATEGORIES && !error
      ? t("enFazlaSektorBeyanEdilebilir", { n: sektorler.length, max: MAX_COMPANY_MAIN_CATEGORIES })
      : null;
  /** Seçimi açan düğmelerin erişilebilir açıklaması (hata ya da tavan notu). */
  const aciklamaId = error ? hataId : tavanUstu ? tavanId : undefined;

  /**
   * Bir sektör kaldırılınca düğmesi DOM'dan gider ve odak <body>'ye düşer
   * (klavye kullanıcısı yerini kaybeder). Odak kaybolduysa ekleme düğmesine —
   * hiç sektör kalmadıysa boş durum düğmesine — taşınır.
   *
   * YALNIZ KLAVYE tetiklemesinde (`detail` 0 — penceredeki çip kuralıyla aynı):
   * `focus()` hedefi görünüme kaydırır; fare/dokunmada her kaldırma sayfayı
   * listenin sonuna atıyordu (webcat-1).
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
   * Tavan denetimi — modalın `validate`ı: reddedilirse modal AÇIK kalır,
   * gerekçe modal içinde yazılır, taslak kaybolmaz (derin denetim 2026-09-29).
   * Pencere tavanı aşacak işareti zaten reddeder; burası onay anındaki son
   * denetim (tavanın üstünde kayıtlı eski beyan).
   */
  const dogrula = (ids: string[]): string | null => {
    const n = sectorsOf(ids).length;
    if (n > MAX_COMPANY_MAIN_CATEGORIES) {
      // Sessizce kırpmak yerine söylüyoruz: hangi sektörün düştüğünü kullanıcı
      // göremezse beyanı eksik kalır ve bunu asla fark etmez.
      return t("enFazlaSektorBeyanEdilebilir", { n, max: MAX_COMPANY_MAIN_CATEGORIES });
    }
    return null;
  };

  const onayla = (ids: string[]) => {
    // `validate` onaydan önce reddetti; buraya tavanı aşan küme gelmez.
    if (dogrula(ids)) return;
    const yeni = sectorsOf(ids);
    // Küme aynıysa beyan da aynıdır: pencereyi hiçbir şeye dokunmadan onaylamak
    // `onChange` üretmez (Ayarlar'da form kirlenip "Kaydet" açılıyor, sayfadan
    // çıkış uyarısı çıkıyordu).
    if (sameIdSet(yeni, sektorler)) return;
    onChange({ mainIds: kayitliSirayla(sektorler, yeni), subIds: [] });
  };

  /** Sektör kaldırılır; eski alt seçimler de (o sektördekiler dahil) gider. */
  const sektorSil = (seg: string, klavyeyle: boolean) => {
    odakGeriAl.current = klavyeyle;
    onChange({ mainIds: sektorler.filter((x) => x !== seg), subIds: [] });
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
          aria-describedby={aciklamaId}
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
                {t("sektorSecin")}
              </span>
              {/* Sektör adını bilmeyen kullanıcı ürün / hizmet adıyla arar. */}
              <span className="mt-0.5 block text-xs break-words text-zinc-500">
                {t("urunYaDaHizmetAdiylaArayabilirsiniz")}
              </span>
            </span>
          </span>
          <Plus className="h-4 w-4 shrink-0 text-zinc-500" />
        </button>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {cizilenler.map((seg) => {
            const ad = sektorAdi(seg);
            return (
              <li
                key={seg}
                /* `max-w-full min-w-0`: çip kutunun içinde kalır; uzun sektör
                   adı kesilmez, sarılır. */
                className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${renk.chip}`}
              >
                {/* `shrink-0`: ad sarılınca ikon ezilmesin. */}
                <Layers className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{ad ?? adYedegi(seg)}</span>
                {!disabled ? (
                  // Dokunma hedefi 32 px; eksi kenar boşluğu çipi büyütmez.
                  <button
                    type="button"
                    // Klavye tetiklemesinde `detail` 0'dır.
                    onClick={(e) => sektorSil(seg, e.detail === 0)}
                    aria-label={t("sektoruKaldir", { segmentAdi: ad ?? seg })}
                    className="-my-2 -mr-2 -ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-rose-600 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-zinc-900"
                  >
                    <XIcon className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
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

      {/* TEK ekleme düğmesi. Boşken birincil eylem zaten yukarıdaki kesikli
          kutu ve ipucu onun içinde — burada tekrarlamak iki özdeş düğme
          bırakırdı. */}
      {!disabled && !bos ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3">
          {/* Metin eylemi en az 32 px yüksek (dokunma hedefi). */}
          <button
            ref={ekleRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-describedby={aciklamaId}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 text-sm font-semibold text-zinc-700 hover:text-zinc-900"
          >
            {tavanda ? (
              <Pencil className="h-4 w-4" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            {tavanda ? t("sektorleriDuzenle") : t("sektorEkle")}
          </button>
          <span className="min-w-0 text-xs break-words text-zinc-500">
            {t("urunYaDaHizmetAdiylaArayabilirsiniz")}
          </span>
        </div>
      ) : null}

      {tavanUstu ? (
        <p id={tavanId} className="mt-1.5 text-xs text-amber-700">
          {tavanUstu}
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
          value={sektorler}
          onConfirm={onayla}
          validate={dogrula}
          mode="multi"
          // Yalnız sektör (L1): ağaçta yalnız sektör satırları, aramada sonuç
          // bağlamıyla ama işaret yalnız sektöre; tek sayaç "Sektör n/5".
          sectorsOnly
          maxSelection={MAX_COMPANY_MAIN_CATEGORIES}
          title={modalTitle}
          description={modalDescription ?? t("sektorPenceresiAciklamasi")}
          catalog="full"
        />
      ) : null}
    </div>
  );
}
