"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { Field, useFieldContext } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useNumberFieldNumber } from "@/components/ui/number-input";
import { CloseDaysInput } from "@/components/tenders/close-days-input";
import { useAddresses } from "@/hooks/use-company-addresses";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  countryDisplayName,
  useCurrencyName,
  useDeliveryTermLabel,
  useLcTypeLabel,
  usePaymentCategoryLabel,
} from "@/i18n/domain";
import { CURRENCIES, DELIVERY_TERMS } from "@/lib/tenders/labels";
import type { LcSubType } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CountryFlag } from "@/components/ui/country-flag";
import { COUNTRIES, isRegistrationOpen, PAYMENT_CATEGORIES, REQUEST_ALLOWED_CURRENCIES_MAX, REQUEST_CLOSE_DAY_OPTIONS, REQUEST_CLOSE_DAYS_MAX, sellerDoorPriceWarning, type RequestDefaults } from "@rothern/shared";
import { Globe, MapPin } from "lucide-react";
import { createContext, useContext, useId, useState } from "react";

const INPUT =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

/** Tedarikçi görünürlüğü seçenekleri (sıra); etiket katalogdan `bidVisibility.<KOD>`. */
const BID_VISIBILITY_CODES = ["OWN_ONLY", "BEST_PRICE", "OWN_RANK", "BEST_AND_OWN_RANK", "ALL"] as const;

export type VisibilityCode = "PUBLIC" | "CONNECTIONS" | "PRIVATE";

/** Görünürlük seçeneği etiketi + ipucu — katalogdan (`web.panel.requests.requestDefaultsForm.visibility.*`). */
export function useVisibilityLabels(): Record<VisibilityCode, { label: string; hint: string }> {
  const t = useTranslations("web.panel.requests.requestDefaultsForm");
  return {
    PUBLIC: { label: t("visibility.PUBLIC.label"), hint: t("visibility.PUBLIC.hint") },
    CONNECTIONS: { label: t("visibility.CONNECTIONS.label"), hint: t("visibility.CONNECTIONS.hint") },
    PRIVATE: { label: t("visibility.PRIVATE.label"), hint: t("visibility.PRIVATE.hint") },
  };
}

/** Vade günü gerektiren ödeme kurgusu mu (API `requestDefaultsSchema` aynası). */
function needsPaymentDays(v: Pick<RequestDefaults, "paymentCategory" | "lcType">): boolean {
  return ["DEFERRED", "CHEQUE", "SENET"].includes(v.paymentCategory) || (v.paymentCategory === "LETTER_OF_CREDIT" && v.lcType === "USANCE");
}

/**
 * İstemci aralık denetimi (arayüz testi D-007): sayı kutularının `min/max`'ı
 * form gönderimi olmadığı için uygulanmıyordu; -5 / 400 gün ya da %101 peşin
 * kayıtta API'nin ham mesajıyla düşüyordu. Alan işaretlenir, kayıt engellenir.
 */
export function requestDefaultsFieldErrors(v: RequestDefaults): { paymentDays?: true; advancePercent?: true } {
  const out: { paymentDays?: true; advancePercent?: true } = {};
  const inRange = (n: number | null, min: number, max: number) => n != null && Number.isInteger(n) && n >= min && n <= max;
  // Yalnız görünen alan denetlenir (gizli alanda işaretsiz hata kalmasın).
  if (needsPaymentDays(v) && !inRange(v.paymentDays, 1, 365)) out.paymentDays = true;
  if (v.paymentCategory === "ADVANCE" && !inRange(v.advancePercent, 1, 100)) out.advancePercent = true;
  return out;
}

/**
 * TALEP ŞARTLARI FORMU — ticari profil (2026-09-09).
 *
 * İki yerde aynı bileşen: Şablonlar › Talep Şartları sayfası ve hızlı talep
 * kartındaki "değiştir" paneli (`compact`).
 *
 * 2026-09-21: yurtiçi/uluslararası kapsamı KALKTI. "Görünürlük ülkesi"
 * (`targetCountries`, boş = tüm ülkeler) talebi kimlerin göreceğini söyler;
 * teslim şekli ve ödeme ülkeye göre süzülmez — alıcı tek şart koyar. Teslim
 * noktası tedarikçinin kapısıysa ve talep birden fazla ülkeye açıksa uyarı.
 */
export function RequestDefaultsForm({
  value,
  onChange,
  compact = false,
  only,
  bare = false,
  readOnly = false,
}: {
  value: RequestDefaults;
  onChange: (next: RequestDefaults) => void;
  compact?: boolean;
  /**
   * Kaydetme yetkisi yok (arayüz testi D-263): bütün kontroller pasif —
   * değiştirilebilir görünüp sessizce kaybolan düzenleme olmasın.
   */
  readOnly?: boolean;
  /** Bölüm başlıklarını gizle — çağıran kendi etiketini yazıyor (hızlı kart). */
  bare?: boolean;
  /** Yalnız bu bölümler çizilir (hızlı kartta tek satır düzenleme). */
  only?: ("scope" | "delivery" | "payment" | "currency" | "visibility" | "close" | "bids" | "address" | "rules")[];
}) {
  const tr = useTranslations("web.panel.requests.requestDefaultsForm");
  const locale = useLocale() as Locale;
  const visibilityLabels = useVisibilityLabels();
  const deliveryTermLabel = useDeliveryTermLabel();
  const paymentCategoryLabel = usePaymentCategoryLabel();
  const lcTypeLabel = useLcTypeLabel();
  const currencyName = useCurrencyName();
  const addresses = useAddresses();
  const { company } = useCompanyAuth();
  const ownerCountry = company?.country ?? "TR";
  const show = (k: NonNullable<typeof only>[number]) => !only || only.includes(k);
  const set = (patch: Partial<RequestDefaults>) => onChange({ ...value, ...patch });
  // Hazır süre seçeneği "Özel gün" kutusunun geçersiz metnini atar (aynı süre de olsa).
  const [closeReset, setCloseReset] = useState(0);
  const countries = value.targetCountries ?? [];
  const limited = countries.length > 0;
  const priceWarning = sellerDoorPriceWarning(countries, ownerCountry, value.deliveryTerm);
  const allTerms = DELIVERY_TERMS;
  const domesticTerms = allTerms.filter((t) => t.startsWith("DOMESTIC_"));
  const incoterms = allTerms.filter((t) => !t.startsWith("DOMESTIC_"));

  const needsDays = needsPaymentDays(value);
  const fieldErrors = requestDefaultsFieldErrors(value);
  const currencyLimitReached = value.allowedCurrencies.length >= REQUEST_ALLOWED_CURRENCIES_MAX;
  const gap = compact ? "space-y-5" : "space-y-8";
  // Örnek başına benzersiz id (arayüz testi webB-10 yeniden doğrulama): hızlı
  // talep sayfası formu iki kez çiziyor (ödeme kartı + şartlar paneli); sabit
  // "tsart-*" id'leri çakışıyor, ikinci etiket ilk girişi işaret ediyordu.
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;

  return (
    <BareContext.Provider value={bare}>
    {/* `fieldset disabled` içindeki bütün düğme/seçim/girişleri pasifler. */}
    <fieldset disabled={readOnly} className={cn("min-w-0", gap)}>
      {show("scope") ? (
        <Block title={tr("gorunurlukUlkesi")} hint={tr("talebiHangiUlkelerdekiTedarikcilerGorsun")}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: false, icon: Globe, label: tr("tumUlkeler") },
              { v: true, icon: MapPin, label: tr("seciliUlkeler") },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => set({ targetCountries: o.v ? (limited ? countries : [ownerCountry]) : [] })}
                aria-pressed={limited === o.v}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition",
                  limited === o.v ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 text-zinc-800 hover:bg-zinc-50",
                )}
              >
                <o.icon aria-hidden className="size-4" />
                {o.label}
              </button>
            ))}
          </div>
          {limited ? (
            <div className="mt-3 space-y-2">
              <ul className="flex flex-wrap gap-1.5" aria-label={tr("seciliUlkeler")}>
                {countries.map((c) => (
                  <li key={c} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20">
                    <CountryFlag code={c} decorative />
                    {countryDisplayName(c, locale)}
                    {/* Son ülke çıkarılamaz (derin denetim S084): boş liste "tüm
                        ülkeler" demektir → kip sessizce genişliyordu. Değiştirmek
                        için önce yenisi eklenir; tümüne açmak "Tüm ülkeler"le. */}
                    <button
                      type="button"
                      aria-label={tr("ulkesiniCikar", { countryName: countryDisplayName(c, locale) })}
                      title={countries.length === 1 ? tr("sonUlkeCikarilamaz") : undefined}
                      disabled={countries.length === 1}
                      onClick={() => set({ targetCountries: countries.filter((x) => x !== c) })}
                      className="text-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-blue-400"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {/* Aranabilir seçici + bayraklar (2026-10-04; eskiden 245 satırlık
                  native select). Kayda kapalı ülke hedeflenemez (API de
                  reddeder; derin denetim X24). */}
              <CountryCombobox
                value=""
                ariaLabel={tr("ulkeEkle")}
                placeholder={tr("ulkeEkle2")}
                disabled={readOnly}
                codes={COUNTRIES.filter((c) => isRegistrationOpen(c.code) && !countries.includes(c.code)).map((c) => c.code)}
                onChange={(code) => {
                  if (code && !countries.includes(code)) set({ targetCountries: [...countries, code] });
                }}
              />
            </div>
          ) : null}
        </Block>
      ) : null}

      {show("delivery") ? (
        <Field>
          <Label htmlFor={fid("teslim")}>{tr("teslimSekli")}</Label>
          <select id={fid("teslim")} value={value.deliveryTerm ?? ""} onChange={(e) => set({ deliveryTerm: e.target.value || null })} className={INPUT}>
            <option value="">{tr("secin")}</option>
            <optgroup label={tr("adreseYurticiTeslim")}>
              {domesticTerms.map((t) => (
                <option key={t} value={t}>
                  {deliveryTermLabel(t)}
                </option>
              ))}
            </optgroup>
            <optgroup label={tr("incotermSinirOtesi")}>
              {incoterms.map((t) => (
                <option key={t} value={t}>
                  {deliveryTermLabel(t)}
                </option>
              ))}
            </optgroup>
          </select>
          {priceWarning ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="note">
              {tr("buTeslimSeklindeFiyatTedarikcinin")}
            </p>
          ) : null}
        </Field>
      ) : null}

      {show("payment") ? (
        <Block title={tr("odemeKosulu")} hint={tr("tedarikciTeklifiniBuKosulaGore")}>
          <select
            aria-label={tr("odemeKosulu")}
            value={value.paymentCategory}
            onChange={(e) => {
              const c = e.target.value;
              set({
                paymentCategory: c,
                advancePercent: c === "ADVANCE" ? (value.advancePercent ?? 100) : null,
                lcType: c === "LETTER_OF_CREDIT" ? (value.lcType ?? "SIGHT") : null,
                paymentDays: ["DEFERRED", "CHEQUE", "SENET"].includes(c) ? (value.paymentDays ?? 30) : c === "LETTER_OF_CREDIT" ? value.paymentDays : null,
              });
            }}
            className={INPUT}
          >
            {/* CUSTOM not ister; profilde/hızlı kartta not alanı yok → yalnız
                zaten CUSTOM olan (eski talep düzenlemesi) değer için listede
                kalır. API de Talep Şartları'nda reddeder (derin denetim MU-10). */}
            {PAYMENT_CATEGORIES.filter((c) => c !== "CUSTOM" || value.paymentCategory === "CUSTOM").map((c) => (
              <option key={c} value={c}>
                {paymentCategoryLabel(c)}
              </option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {value.paymentCategory === "ADVANCE" ? (
              <Field hint={tr("n100TamPesinAltiKismi")} error={fieldErrors.advancePercent ? tr("pesinYuzdesiAraligi") : undefined}>
                <Label htmlFor={fid("pesin")}>{tr("pesinYuzdesi")}</Label>
                <NumberInput id={fid("pesin")} min={1} max={100} value={value.advancePercent} onChange={(n) => set({ advancePercent: n })} />
              </Field>
            ) : null}
            {value.paymentCategory === "LETTER_OF_CREDIT" ? (
              <Field>
                <Label htmlFor={fid("lc")}>{tr("akreditifTipi")}</Label>
                <select id={fid("lc")} value={value.lcType ?? "SIGHT"} onChange={(e) => set({ lcType: e.target.value })} className={INPUT}>
                  {(["SIGHT", "USANCE"] as LcSubType[]).map((t) => (
                    <option key={t} value={t}>{lcTypeLabel(t)}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            {needsDays ? (
              <Field error={fieldErrors.paymentDays ? tr("vadeGunAraligi") : undefined}>
                <Label htmlFor={fid("vade")} required>{tr("vadeGun")}</Label>
                <NumberInput id={fid("vade")} min={1} max={365} value={value.paymentDays} onChange={(n) => set({ paymentDays: n })} />
              </Field>
            ) : null}
          </div>
        </Block>
      ) : null}

      {show("currency") ? (
        <Block title={tr("paraBirimi")} hint={tr("anaBirimTeklifKarsilastirmasininTabanidir")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <Label htmlFor={fid("para")}>{tr("anaParaBirimi")}</Label>
              <select
                id={fid("para")}
                value={value.primaryCurrency}
                onChange={(e) => {
                  const c = e.target.value;
                  // Tavandayken yeni ana birim eskisinin yerini alır (D-046).
                  const rest = value.allowedCurrencies.length >= REQUEST_ALLOWED_CURRENCIES_MAX ? value.allowedCurrencies.filter((x) => x !== value.primaryCurrency) : value.allowedCurrencies;
                  set({ primaryCurrency: c, allowedCurrencies: value.allowedCurrencies.includes(c) ? value.allowedCurrencies : [c, ...rest].slice(0, REQUEST_ALLOWED_CURRENCIES_MAX) });
                }}
                className={INPUT}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c} — {currencyName(c)}</option>
                ))}
              </select>
            </Field>
            <div>
              {/* Çip grubu — tek kontrol yok, başlık olarak basılıp gruba bağlanır. */}
              <Label as="p" id={fid("birimler-baslik")}>{tr("kabulEdilenBirimler")}</Label>
              <div role="group" aria-labelledby={fid("birimler-baslik")} aria-describedby={currencyLimitReached ? fid("birimler-sinir") : undefined} className="flex flex-wrap gap-1.5">
                {CURRENCIES.map((c) => {
                  const on = value.allowedCurrencies.includes(c);
                  const locked = c === value.primaryCurrency;
                  // Üst sınırda seçilmemiş çip eklenemez (arayüz testi D-046;
                  // API aynı sabitle reddeder).
                  const full = !on && currencyLimitReached;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={locked || full}
                      aria-pressed={on}
                      onClick={() => set({ allowedCurrencies: on ? value.allowedCurrencies.filter((x) => x !== c) : [...value.allowedCurrencies, c] })}
                      className={cn("rounded-md px-2 py-1 text-xs font-medium ring-1 transition", on ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50", locked && "opacity-70", full && "cursor-not-allowed opacity-40 hover:bg-white")}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {currencyLimitReached ? (
                <p id={fid("birimler-sinir")} className="mt-1.5 text-xs text-zinc-500">
                  {tr("enFazlaBirim", { max: REQUEST_ALLOWED_CURRENCIES_MAX })}
                </p>
              ) : null}
            </div>
          </div>
        </Block>
      ) : null}

      {show("visibility") ? (
        <Block title={tr("kimlerGorsun")} hint={tr("talebinVarsayilanGorunurluguHerTalepte")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["PUBLIC", "CONNECTIONS", "PRIVATE"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set({ visibility: v })}
                aria-pressed={value.visibility === v}
                className={cn("rounded-xl border p-3 text-left transition", value.visibility === v ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-300 hover:bg-zinc-50")}
              >
                <p className="text-sm font-semibold text-zinc-950">{visibilityLabels[v].label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{visibilityLabels[v].hint}</p>
              </button>
            ))}
          </div>
        </Block>
      ) : null}

      {show("close") ? (
        <Block title={tr("teklifToplamaSuresi")} hint={tr("kapanisYayinBuKadarGun")}>
          <div className="flex flex-wrap items-center gap-2">
            {REQUEST_CLOSE_DAY_OPTIONS.map((d) => (
              <button key={d} type="button" aria-pressed={value.closeDays === d} onClick={() => {
                set({ closeDays: d });
                setCloseReset((n) => n + 1);
              }} className={cn("rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition", value.closeDays === d ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50")}>
                {tr("gun", { d: d })}
              </button>
            ))}
            <CloseDaysInput value={value.closeDays} max={REQUEST_CLOSE_DAYS_MAX} onChange={(d) => set({ closeDays: d })} resetSignal={closeReset} ariaLabel={tr("ozelGunSayisi")} suffix={tr("gun2")} labelClassName="flex items-center gap-2 text-sm text-zinc-600" className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
          </div>
        </Block>
      ) : null}

      {show("bids") ? (
        <Block title={tr("teklifKurallari")} hint={tr("kapaliZarfTedarikcilerBirbirininTeklifini")}>
          <div className="space-y-3">
            <Field>
              <Label htmlFor={fid("gorunur")}>{tr("tedarikciNeGorur")}</Label>
              <select id={fid("gorunur")} value={value.bidVisibility} onChange={(e) => set({ bidVisibility: e.target.value })} className={INPUT}>
                {BID_VISIBILITY_CODES.map((v) => (
                  <option key={v} value={v}>{tr(`bidVisibility.${v}`)}</option>
                ))}
              </select>
            </Field>
          </div>
        </Block>
      ) : null}

      {show("address") ? (
        <Block title={tr("teslimatAdresi")} hint={tr("varsayilanAdresHerTalepteDegistirilebilir")}>
          <select aria-label={tr("teslimatAdresi")} value={value.deliveryAddressId ?? ""} onChange={(e) => set({ deliveryAddressId: e.target.value || null })} className={INPUT}>
            <option value="">{tr("talepteSecilir")}</option>
            {(addresses.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}{a.city ? ` · ${a.city}` : ""}
              </option>
            ))}
          </select>
          <div className="mt-3">
            <Toggle label={tr("faturaAdresiTeslimatAdresiyleAyni")} checked={value.billingSameAsDelivery} onChange={(v) => set({ billingSameAsDelivery: v })} />
          </div>
        </Block>
      ) : null}

      {show("rules") ? (
        <Block title={tr("tekliftenBeklentiler")}>
          <div className="space-y-3">
            <Toggle label={tr("tumKalemlereTeklifZorunlu")} checked={value.requireAllItems} onChange={(v) => set({ requireAllItems: v })} />
            <Toggle label={tr("teklifleBirlikteBelgeZorunlu")} checked={value.requireBidDocument} onChange={(v) => set({ requireBidDocument: v })} />
          </div>
        </Block>
      ) : null}
    </fieldset>
    </BareContext.Provider>
  );
}

/**
 * Sayı kutusu — Field bağlamından aria-invalid/aria-describedby okur. Yerel
 * tam sayı girişi (arayüz testi kapanış NUM): `type="number"` Türkçe
 * tarayıcıda "2,5" peşini %25, "0,5" vadeyi 5 gün kaydediyordu. Geçersiz giriş
 * `NaN` bildirilir → `requestDefaultsFieldErrors` alanı işaretler.
 */
function NumberInput({ id, value, onChange }: { id: string; min: number; max: number; value: number | null; onChange: (n: number | null) => void }) {
  const field = useFieldContext();
  const { invalid, inputProps } = useNumberFieldNumber({ value, onChange });
  const bad = invalid || field?.invalid;
  return (
    <input
      id={id}
      {...inputProps}
      aria-invalid={bad || undefined}
      aria-describedby={field?.describedBy}
      className={cn(INPUT, bad && "border-red-500 focus:border-red-600 focus:ring-red-600/10")}
    />
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const bare = useContext(BareContext);
  if (bare) return <div>{children}</div>;
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      {hint ? <p className="mt-0.5 mb-3 text-xs text-zinc-500">{hint}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}
const BareContext = createContext(false);

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-zinc-900" : "bg-zinc-300")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition", checked ? "left-4.5" : "left-0.5")} />
      </button>
    </label>
  );
}
