"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  Description,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Field,
} from "@headlessui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { Button } from "@/components/catalyst/button";
import { Input, InputGroup } from "@/components/catalyst/input";
import { IconButton } from "@/components/ui/icon-button";

/**
 * KATEGORİ PENCERESİNİN KABUĞU — `CategorySelectorModal` (talep / ürün
 * kategorisi ve firma beyanı aynı pencereyi kullanır).
 *
 * Kabuk ayrı bir bileşen çünkü garantileri pencerenin içeriğinden bağımsız
 * (2026-10 kayıt denetimi): eskiden ikinci bir "Sektör geneli" penceresi elle
 * yazılmış `div role=dialog` idi — odak kilidi yoktu, `z-50` ile asistan
 * çekmecesinin ALTINDA kalıyordu, yüksekliği `vh` ile sınırlıydı (telefonda
 * adres çubuğu görünürken alt satır kesiliyordu). O pencere 2026-10-08'de
 * kalktı (sektör artık aynı pencerede işaretleniyor); garantiler burada durur.
 *
 * Kabuğun garantileri:
 *  - Headless `Dialog`: portal + `z-[60]` (çekmecenin üstü), odak kilidi,
 *    kaydırma kilidi, Escape.
 *  - Yükseklik `dvh`: panel görünen alanı aşmaz; başlık ve alt satır küçülmez,
 *    aradaki bölüm küçülür. `dvh` tanımayan tarayıcıda yüzde yedeği (kapsayıcı
 *    `fixed inset-0`, yani aynı alan).
 *  - Çok kısa ekranda (yatay telefon) aradaki bölümün TAMAMI tek parça kayar;
 *    alt satır yine görünür kalır. Bildirimler (`CategoryDialogNotices`) o
 *    kipte kayan bölümün tepesine yapışır — kaydırılmış listede de görünür.
 *  - Onaylanmamış değişiklik varken Escape / dış tıklama / X önce sorar;
 *    "Vazgeç" sormadan kapatır (açık bir vazgeçme zaten). Soruda güvenli
 *    seçenek ("Seçime dön") birincil düğmedir; soru kapanınca odak kullanıcının
 *    bıraktığı öğeye döner.
 */
interface ShellProps {
  isOpen: boolean;
  /** Pencereyi gerçekten kapatır (taslak atılır). */
  onClose: () => void;
  /** Taslak kayıtlı seçimden farklı mı. */
  dirty: boolean;
  title: string;
  description?: string;
  icon: ReactNode;
  /** Başlık ile alt satır arasındaki bölümler (arama, seçim şeridi, liste). */
  children: ReactNode;
  /** Alt satırın solundaki durum metni — dar ekranda gizlenir (yer listeye kalır). */
  footerStatus?: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
}

export function CategoryDialogShell({
  isOpen,
  onClose,
  dirty,
  title,
  description,
  icon,
  children,
  footerStatus,
  confirmLabel,
  confirmDisabled,
  onConfirm,
}: ShellProps) {
  const t = useTranslations("web.shared.categorySelectorModal");
  const [asking, setAsking] = useState(false);
  const promptId = useId();
  const backRef = useRef<HTMLElement>(null);
  /** Soru açılmadan önce odakta olan öğe — "Seçime dön"de oraya dönülür. */
  const restoreFocus = useRef<HTMLElement | null>(null);
  /**
   * Pencere içeriğinde en son odaklanan öğe. Headless Dialog, Escape'te
   * `onClose`dan ÖNCE `document.activeElement.blur()` çağırır: o yolda
   * `activeElement` <body>'dir ve dönülecek yer ancak buradan bilinir.
   */
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setAsking(false);
    lastFocus.current = null;
  }, [isOpen]);

  // Odak, `inert` kalktıktan / soru çizildikten SONRA taşınır (commit sonrası).
  useEffect(() => {
    if (asking) {
      backRef.current?.focus();
      return;
    }
    const el = restoreFocus.current;
    restoreFocus.current = null;
    if (el?.isConnected) el.focus();
  }, [asking]);

  /** Escape, dış tıklama ve X buradan geçer. */
  const requestClose = () => {
    // Soru açıkken ikinci Escape / dış tıklama soruyu kapatır, pencereyi değil.
    if (asking) {
      setAsking(false);
      return;
    }
    if (!dirty) {
      onClose();
      return;
    }
    // Odak yerindeyse (X düğmesi; dış tıklamada tarayıcının odak verdiği
    // pencere kökü) o öğe. Escape'te odak <body>'ye düşmüştür → içerikte en son
    // odaklanan öğe (onay kutusu, arama kutusu…).
    const active = document.activeElement;
    restoreFocus.current =
      active instanceof HTMLElement && active !== document.body
        ? active
        : lastFocus.current;
    setAsking(true);
  };

  return (
    <Dialog open={isOpen} onClose={requestClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/45 backdrop-blur-[2px] transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150"
      />
      <div className="fixed inset-0 flex w-screen items-start justify-center p-2 pt-4 sm:p-4 sm:pt-6">
        <DialogPanel
          transition
          className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 outline-none transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 data-closed:data-enter:scale-95 supports-[height:100dvh]:max-h-[calc(100dvh-1.5rem)] sm:supports-[height:100dvh]:max-h-[calc(100dvh-2.5rem)] lg:max-w-3xl"
        >
          {/* `contents`: sarmalayıcı yerleşime girmez; soru açıkken alttaki
              her şey `inert` olur (odak ve tıklama soruya kalır). `onFocus`
              (focusin, kabarır): soru kapanınca dönülecek yeri izler. */}
          <div
            className="contents"
            inert={asking || undefined}
            onFocus={(e) => {
              lastFocus.current = e.target instanceof HTMLElement ? e.target : null;
            }}
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-950/5 px-4 py-3 sm:px-6 sm:py-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 sm:flex">
                  {icon}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold text-zinc-950 sm:text-lg">
                    {title}
                  </DialogTitle>
                  {description ? (
                    <p className="mt-0.5 text-xs text-zinc-500 [@media(max-height:520px)]:hidden">
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>
              <IconButton
                aria-label={t("kapat")}
                onClick={requestClose}
                className="shrink-0"
              >
                <X className="h-5 w-5" />
              </IconButton>
            </div>

            <div className="flex min-h-0 flex-1 flex-col [@media(max-height:520px)]:overflow-y-auto">
              {children}
            </div>

            {/* Footer */}
            {/* Dar ekranda sarılır: Rusça "Подтвердить (1)" 360–390 px'te diyaloğun
                dışına taşıyordu (tarayıcı turu 2026-10-07). Düğmeler küçülmez, alt satıra iner. */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-zinc-950/5 bg-zinc-50/60 px-4 py-3 sm:px-6 sm:py-3.5">
              <span className="hidden min-w-0 text-xs text-zinc-500 sm:block">
                {footerStatus}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button plain onClick={onClose}>
                  {t("vazgec")}
                </Button>
                <Button onClick={onConfirm} disabled={confirmDisabled}>
                  {confirmLabel}
                </Button>
              </div>
            </div>
          </div>

          {asking ? (
            // Kutu genişliği düğme çiftine göre seçildi (Chromium'da ölçüldü,
            // iki düğme + aralık: TR 315 / EN 399 / RU 474 px telefon boyutunda,
            // 282 / 358 / 422 px geniş ekranda): `max-w-lg` ile geniş ekranda üç
            // dilde de yan yana; telefonda iç boşluklar küçük tutulur ki Türkçe
            // çift 390 px'te sığsın, en uzun Rusça düğme 360 px'te tek satır kalsın.
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/85 p-3 sm:p-4">
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${promptId}-title`}
                aria-describedby={`${promptId}-text`}
                className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl ring-1 ring-zinc-950/10 sm:p-5"
              >
                <h3
                  id={`${promptId}-title`}
                  className="text-base font-semibold text-zinc-950"
                >
                  {t("secimlerinizOnaylanmadi")}
                </h3>
                <p id={`${promptId}-text`} className="mt-1 text-sm text-zinc-600">
                  {t("pencereyiKapatirsanizDegisikliklerKaybolur")}
                </p>
                {/* GÜVENLİ seçenek birincil (dolgulu) düğmedir ve odak onda başlar;
                    taslağı atan "Onaylamadan kapat" düz düğme.
                    Yerleşim metne göre, kırılım noktasına göre DEĞİL: ikisi
                    sığıyorsa yan yana (birincil sağda — alt satırdaki Vazgeç /
                    Onayla düzeni), sığmıyorsa alt alta (birincil üstte).
                    `flex-row-reverse` + `flex-wrap`: DOM sırası güvenli → atan;
                    satır sağdan dolar, sarınca ikinci düğme alta iner.
                    Telefonda düğmeler satırı doldurur (`grow`); geniş ekranda
                    kendi genişliğinde sağa yaslanır. */}
                <div className="mt-4 flex flex-row-reverse flex-wrap gap-2">
                  <Button
                    onClick={() => setAsking(false)}
                    ref={backRef}
                    className="grow sm:grow-0"
                  >
                    {t("secimeDon")}
                  </Button>
                  <Button plain onClick={onClose} className="grow sm:grow-0">
                    {t("onaylamadanKapat")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

/** İki kümenin aynı kodları taşıyıp taşımadığı (sıra önemsiz) — "taslak değişti mi". */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export interface DialogFlash {
  text: string;
  /** `warn`: tavan uyarısı (amber). `info`: bilgi notu (nötr). */
  tone: "warn" | "info";
}

interface NoticesProps {
  /** Kalıcı ret satırı (onay reddi) — yer kaplar; seçim değişene dek durur. */
  rejection?: string | null;
  /**
   * Kısa ömürlü bildirim — listenin ÜSTÜNE biner, yerleşimi itmez (araya giren
   * satır listeyi parmağın altından kaydırıyordu).
   */
  flash?: DialogFlash | null;
}

/**
 * PENCERE BİLDİRİMLERİ — liste bölümünün hemen üstünde, kabuğun DOĞRUDAN çocuğu
 * olarak çizilir (arama ve seçim şeridinden sonra, listeden önce).
 *
 * Neden listenin içinde değil: çok kısa ekranda (yükseklik ≤ 520 px) aradaki
 * bölümün tamamı tek parça kayar. Bildirim liste bloğunun tepesine
 * konumlandığında (ya da listenin üstünde sıradan bir satır olduğunda) liste
 * kaydırılınca görüş alanından çıkıyordu: 640×360'ta dördüncü sınıf
 * işaretlenince hiçbir şey değişmiyor, "Onayla" reddedilince düğme ölü
 * görünüyordu (bildirimler y = −1264 / −771'de çiziliyordu).
 *
 * O kipte bu blok kayan bölümün tepesine yapışır (`sticky`; kaydıran öğenin
 * doğrudan çocuğu olduğu için kaydırma boyunca yapışık kalır). Normal kipte
 * yerinde durur: ret satırı listeyi aşağı iter, kısa bildirim sıfır
 * yükseklikli çapadan listenin ilk satırlarının üstüne biner.
 */
export function CategoryDialogNotices({ rejection, flash }: NoticesProps) {
  if (!rejection && !flash) return null;
  return (
    <div className="relative z-10 shrink-0 [@media(max-height:520px)]:sticky [@media(max-height:520px)]:top-0">
      {rejection ? (
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 sm:px-6"
        >
          ⚠️ {rejection}
        </div>
      ) : null}
      {flash ? (
        <div className="relative h-0">
          <div
            role="status"
            className={`absolute inset-x-0 top-0 border-b px-4 py-2 text-xs font-medium shadow-sm sm:px-6 ${
              flash.tone === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-zinc-200 bg-zinc-100 text-zinc-700"
            }`}
          >
            {flash.tone === "warn" ? "⚠️ " : null}
            {flash.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface SearchFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** Kutunun altındaki yardımcı satır (örnekler ya da "en az 2 karakter"). */
  helper?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Arama kutusu — pencere açılınca odak buradadır (`autoFocus`; Headless Dialog
 * ilk odağı bu özniteliğe göre seçer). Yer tutucu KISA: uzun örnekli metin
 * 360 px'te üç dilde de kesiliyordu; örnekler alttaki yardımcı satırda.
 */
export function CategorySearchField({
  value,
  onChange,
  placeholder,
  helper,
  inputRef,
}: SearchFieldProps) {
  const t = useTranslations("web.shared.categorySelectorModal");
  const ownRef = useRef<HTMLInputElement | null>(null);
  const setRef = (el: HTMLInputElement | null) => {
    ownRef.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) inputRef.current = el;
  };

  // Headless `Field` + `Description`: yardımcı satır kutunun erişilebilir
  // açıklaması olur (Headless Input kendi `aria-describedby`ını yazar; elle
  // verilen öznitelik eziliyordu).
  return (
    <Field className="shrink-0 border-b border-zinc-950/5 px-4 py-3 sm:px-6 sm:py-4">
      <div className="relative">
        <InputGroup>
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            ref={setRef}
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            // Catalyst Input className'i sarmalayıcıya verir → iç input hedeflenir.
            className={value ? "[&_input]:pr-10" : undefined}
          />
        </InputGroup>
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              ownRef.current?.focus();
            }}
            aria-label={t("aramayiTemizle")}
            className="absolute top-1/2 right-1 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {helper ? (
        <Description className="mt-1.5 text-xs text-zinc-500 [@media(max-height:520px)]:hidden">
          {helper}
        </Description>
      ) : null}
    </Field>
  );
}

/** İki tavanlı sayaçta bir tavanın rozeti. */
export interface SelectionTally {
  /** Görünen metin: "Sektör 2/5". */
  text: string;
  /** Ekran okuyucu için tam cümle: "2 sektörde seçim var (en fazla 5)". */
  srText: string;
}

interface SelectionCounterProps {
  label: string;
  count: number;
  max: number;
  /**
   * İKİ TAVANLI sayaç (firma beyanı: sektör + ürün/hizmet). Verilince tek
   * "n/max" rozeti yerine her tavan KENDİ ADIYLA ayrı rozet olur — tek sayı
   * hangi tavana ne kadar kaldığını söylemez. `count` yine "Tümünü temizle"yi
   * açar; `max` o kipte basılmaz.
   */
  tallies?: SelectionTally[];
  clearLabel: string;
  /**
   * Seçimi boşaltır. `viaKeyboard`: düğme klavyeyle tetiklendi (`detail` 0).
   * Düğme yalnız seçim varken çizildiği için temizleyince DOM'dan gider ve odak
   * <body>'ye düşer → çağıran klavye yolunda odağı arama kutusuna taşır.
   * Dokunma / farede taşınmaz (arama kutusu ekran klavyesini açardı).
   */
  onClear: (viaKeyboard: boolean) => void;
}

/**
 * "SEÇİMLERİNİZ 3/50 … Tümünü temizle" satırı.
 *
 * İki tavanlı kipte (`tallies`) rozetler dar ekranda KENDİ satırına iner:
 * 360 px'te başlık + iki adlı rozet + "Tümünü temizle" tek satıra sığmıyor
 * (RU: "Товары / услуги 12/50"). Geniş ekranda hepsi tek satırda, rozetler
 * başlığın yanında. Tek tavanlı kipin yerleşimi DEĞİŞMEDİ.
 */
export function SelectionCounter({
  label,
  count,
  max,
  tallies,
  clearLabel,
  onClear,
}: SelectionCounterProps) {
  return (
    <div
      className={
        tallies
          ? "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
          : "flex items-center justify-between gap-3"
      }
    >
      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        {label}
        {tallies ? null : (
          <span className="ml-1 rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
            <span>
              {count}/{max}
            </span>
          </span>
        )}
      </span>
      {tallies ? (
        <span
          data-slot="tallies"
          className="order-last flex min-w-0 basis-full flex-wrap gap-x-1.5 gap-y-1 sm:order-none sm:mr-auto sm:basis-auto"
        >
          {tallies.map((tally, i) => (
            <span
              // Sıra sabit (sektör, ürün/hizmet); metin her seçimde değişir.
              key={i}
              className="max-w-full rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-bold break-words text-white tabular-nums"
            >
              {/* Rolsüz <span>'de aria-label geçersizdir; tam cümle gizli metinle verilir. */}
              <span aria-hidden>{tally.text}</span>
              <span className="sr-only">{tally.srText}</span>
            </span>
          ))}
        </span>
      ) : null}
      {count > 0 ? (
        // Dokunma hedefi 32 px; eksi kenar boşluğu satırı büyütmesin diye.
        <button
          type="button"
          onClick={(e: MouseEvent<HTMLButtonElement>) => onClear(e.detail === 0)}
          className="-my-1.5 inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded px-1 text-xs font-semibold text-zinc-600 hover:text-danger-600"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Bir kutunun dikey kenarları (görüş alanı koordinatı). */
interface VerticalEdges {
  top: number;
  bottom: number;
}

/** Şeridin görünen kutusuna göre çiplerin durumu. */
export interface StripOverflow {
  /** Yukarıda GİZLİ çip sayısı (yarıdan fazlası görünen alanın üstünde). */
  above: number;
  /** Aşağıda GİZLİ çip sayısı (yarıdan fazlası görünen alanın altında) — haptaki "+N". */
  below: number;
  /** Alt kenarda kesilen çip var: şerit aşağı kayabilir — ipucu bununla açılır. */
  cut: boolean;
}

/**
 * Şeridin görünen kutusunun DIŞINDA kalan çipler — saf, testte doğrudan ölçülür.
 *
 * İki ayrı soru:
 *  - `cut`: şerit aşağı kayıyor mu? Alt kenarı kesilen TEK çip yeter (1 px
 *    pay: kesirli ölçüler — ölçekli geçiş, 2x ekran — sığan çipi kesik saymasın).
 *  - `below` / `above`: kaç çip GİZLİ? Çip, yarıdan fazlası görünen alanın
 *    dışındaysa gizlidir (orta noktası kenarın ötesinde). Birkaç pikseli kesilen
 *    çip görülmüştür: tam görünmeyen her çipi saymak, üç çipin biri neredeyse
 *    tam görünürken "+3" dedirtiyordu.
 */
export function stripOverflow(
  view: VerticalEdges,
  chips: readonly VerticalEdges[],
): StripOverflow {
  let above = 0;
  let below = 0;
  let cut = false;
  for (const chip of chips) {
    const middle = (chip.top + chip.bottom) / 2;
    if (middle > view.bottom) below += 1;
    else if (middle < view.top) above += 1;
    if (chip.bottom > view.bottom + 1) cut = true;
  }
  return { above, below, cut };
}

const NO_OVERFLOW: StripOverflow = { above: 0, below: 0, cut: false };

/** Şeritte bir çipin metni en çok kaç satır tutar (ad + "· sektörün tamamı" eki). */
export const STRIP_CHIP_MAX_LINES = 3;

/**
 * Ekli çipin (ad + satır içi ek) akış yüksekliği tavanı aşıyor mu — aşıyorsa
 * çip "bölünür": ad iki satıra kırpılır, ek kendi satırına iner. Saf.
 */
export function chipNeedsSplit(runHeight: number, lineHeight: number): boolean {
  if (!(lineHeight > 0)) return false;
  return runHeight > STRIP_CHIP_MAX_LINES * lineHeight + 1;
}

interface SelectionStripProps {
  /** Listenin erişilebilir adı ("Seçimleriniz"). */
  label: string;
  /** Çip listesi (`<ul>`) — çağıran, klavyeyle kaldırmada odağı buradan taşır. */
  listRef: RefObject<HTMLUListElement | null>;
  /** `<li>` çipler. */
  children: ReactNode;
}

/**
 * SEÇİM ŞERİDİ — seçilen çipler; yüksekliği SINIRLI ve kendi içinde kayar
 * (sınırsızken 15-20 seçimde liste 24 px'e iniyor, Vazgeç / Onayla pencerenin
 * dışına itiliyordu).
 *
 * Arayüz testi CAT-D3 (360×640, Rusça): dört satırlık bir sektör çipi şeridi
 * tek başına dolduruyor, sayaç "3" derken tek çip görünüyordu; telefonda
 * kaydırma çubuğu yer kaplamadığı için gerisinin varlığını hiçbir şey
 * söylemiyordu. İki kural:
 *
 * 1) ÇİP ŞERİTTE EN ÇOK 3 SATIR (`STRIP_CHIP_MAX_LINES`). Eksiz çip düz CSS ile
 *    kırpılır (`line-clamp-3`, çağıranda). "· sektörün tamamı" EKLİ çipte ek
 *    adın peşinden akar (çoğu ad böyle 1-2 satır tutar); düz kırpma eki de
 *    keserdi ve çipin bütün sektörü beyan ettiği okunmazdı. Bu yüzden ekli çip
 *    ÖLÇÜLÜR (`data-chip-run`): akış tavanı aşıyorsa `<li>` `data-split` alır —
 *    ad iki satıra kırpılır, ek kendi satırında görünür kalır (çağıranın
 *    sınıfları). İşaret React durumu değil DOM özniteliği: yalnız yerleşimden
 *    türeyen sunum bilgisi; her ölçümde akış kipine dönülüp YENİDEN karar
 *    verilir (genişlik değişince çip kendiliğinden eski hâline döner, kipler
 *    arasında salınım olmaz). Adın tamamı listede, sayfadaki kartta, çipin
 *    ipucunda ve kaldırma düğmesinin adında durur.
 *
 * 2) ŞERİT KAYDIĞINI SÖYLER. Alt kenarda kesilen çip oldukça (şerit aşağı
 *    kayabildikçe) ortada "⌄" hapı durur; yarıdan fazlası gizli çip varsa hap
 *    sayısını da söyler ("⌄ +N") ve alt kenar solar. Yalnız birkaç pikseli
 *    kesilen son satırda ok tek başına kalır — neredeyse tam görünen satır
 *    soldurulmaz. Yukarıda gizli çip kaldıysa üst kenar solar. Hap şeridi bir
 *    ekran aşağı kaydırır. Hap yalnız
 *    GÖRSEL ipucu: ekran okuyucu listenin tamamını zaten okur, klavye çiplerin
 *    kaldırma düğmeleriyle gezer (odak şeridi kendiliğinden kaydırır) →
 *    `aria-hidden` + sekme sırasının dışında.
 *
 * Ölçüm: her çizimden sonra (çip eklendi / kaldırıldı, adlar geldi), şeridin ya
 * da bir çipin kutusu değişince (pencere boyutu, yön, geç yüklenen yazı tipi)
 * ve kaydırmada (yalnız sayım).
 *
 * `-mr-1 pr-1`: kaldırma düğmesi çipin 4 px dışına taşar (32 px hedef, çipi
 * büyütmeden); sağ kenara dayanan çipte bu taşma şeridi 4 px yana
 * kaydırılabilir yapıyor, klasik kaydırma çubuklu pencerede yatay çubuk
 * çıkarıyordu. Taşma şeridin kendi iç boşluğuna düşer; `overflow-x-hidden`
 * yana kaymayı her durumda kapatır (`overflow-y-auto` tek başına x eksenini de
 * `auto` yapar). `py-1`: 32 px'lik kaldırma hedefleri ilk/son satırda kırpılmasın.
 */
export function SelectionStrip({ label, listRef, children }: SelectionStripProps) {
  const [overflow, setOverflow] = useState(NO_OVERFLOW);

  /** Görünen alanın dışındaki çipleri sayar (kaydırmada da çağrılır). */
  const count = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const next = stripOverflow(
      el.getBoundingClientRect(),
      Array.from(el.children, (chip) => chip.getBoundingClientRect()),
    );
    // Değişmediyse aynı nesne: her çizimden sonra ölçmek döngüye girmez.
    setOverflow((prev) =>
      prev.above === next.above && prev.below === next.below && prev.cut === next.cut
        ? prev
        : next,
    );
  }, [listRef]);

  /** Ekli çiplerin kipini (akış / bölünmüş) yeniden belirler, sonra sayar. */
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const runs = Array.from(el.querySelectorAll<HTMLElement>("[data-chip-run]"));
    // Önce hepsi akış kipine: karar her zaman adın + ekin doğal yüksekliğinden.
    for (const run of runs) run.closest("li")?.removeAttribute("data-split");
    const split = runs.filter((run) =>
      chipNeedsSplit(run.offsetHeight, parseFloat(getComputedStyle(run).lineHeight)),
    );
    for (const run of split) run.closest("li")?.setAttribute("data-split", "");
    count();
  }, [listRef, count]);

  // Her çizimden sonra, boyamadan önce.
  useLayoutEffect(measure);

  // Kutu değişimleri: şeridin kendisi + her çip (çizimde liste yeniden bağlanır).
  // Ölçüm çip kutularını DEĞİŞTİREBİLİR (bölünme) → gözlemcinin geri çağrısı
  // içinde değil, bir sonraki karede yapılır: geri çağrı içinde gözlenen kutuyu
  // değiştirmek tarayıcıda "ResizeObserver loop" hatası üretir (hata olayı
  // istemci hata bildirimine de düşerdi).
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.current = ro;
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      observer.current = null;
    };
  }, [measure]);
  useEffect(() => {
    const ro = observer.current;
    const el = listRef.current;
    if (!ro || !el) return;
    ro.disconnect();
    ro.observe(el);
    for (const chip of Array.from(el.children)) ro.observe(chip);
  });

  const showMore = () => {
    const el = listRef.current;
    if (!el) return;
    // Bir ekran eksi bir satır: son görünen satır kaydırmadan sonra da görünür.
    el.scrollTop += Math.max(el.clientHeight - 32, 24);
    count();
  };

  return (
    <div className="relative mt-1">
      <ul
        ref={listRef}
        aria-label={label}
        onScroll={count}
        className="-mr-1 flex max-h-24 flex-wrap gap-2 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth py-1 pr-1 motion-reduce:scroll-auto sm:max-h-32 [@media(max-height:520px)]:max-h-12"
      >
        {children}
      </ul>
      {overflow.above > 0 ? (
        <span
          aria-hidden
          data-slot="strip-fade-top"
          className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-zinc-50 to-transparent"
        />
      ) : null}
      {overflow.below > 0 ? (
        <span
          aria-hidden
          data-slot="strip-fade-bottom"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-zinc-50 to-transparent"
        />
      ) : null}
      {overflow.cut ? (
        <>
          {/* Hap şeridin alt kenarına BİNER (`-bottom-2`): yarısı şeridin altındaki
              iç boşluğa düşer, yarım görünen çipin yazısını daha az örter.
              Dokunma hedefi görünmeyen çerçeveyle büyür (hap 20 px). Basınca
              odak taşınmaz (`mousedown` engellenir): arama kutusundaki odak ve
              açık ekran klavyesi yerinde kalır. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            data-slot="strip-more"
            onMouseDown={(e) => e.preventDefault()}
            onClick={showMore}
            className={`absolute -bottom-2 left-1/2 inline-flex h-5 -translate-x-1/2 items-center gap-0.5 rounded-full bg-white text-xs font-semibold text-zinc-700 tabular-nums shadow-sm ring-1 ring-zinc-950/15 after:absolute after:-inset-x-4 after:-inset-y-1.5 hover:text-zinc-950 ${
              overflow.below > 0 ? "pr-2 pl-1" : "px-1"
            }`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {overflow.below > 0 ? `+${overflow.below}` : null}
          </button>
        </>
      ) : null}
    </div>
  );
}
