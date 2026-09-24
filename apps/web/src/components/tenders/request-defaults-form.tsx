"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useAddresses } from "@/hooks/use-company-addresses";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  countryDisplayName,
  useCurrencyName,
  useDeliveryTermLabel,
  useLcTypeLabel,
  usePaymentCategoryLabel,
} from "@/i18n/domain";
import { CURRENCIES, DELIVERY_TERM_LABELS } from "@/lib/tenders/labels";
import type { LcSubType } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { COUNTRIES, PAYMENT_CATEGORIES, REQUEST_CLOSE_DAY_OPTIONS, REQUEST_CLOSE_DAYS_MAX, sellerDoorPriceWarning, type RequestDefaults } from "@rothern/shared";
import { Globe, MapPin } from "lucide-react";
import { createContext, useContext } from "react";

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
}: {
  value: RequestDefaults;
  onChange: (next: RequestDefaults) => void;
  compact?: boolean;
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
  const countries = value.targetCountries ?? [];
  const limited = countries.length > 0;
  const priceWarning = sellerDoorPriceWarning(countries, ownerCountry, value.deliveryTerm);
  const allTerms = Object.keys(DELIVERY_TERM_LABELS);
  const domesticTerms = allTerms.filter((t) => t.startsWith("DOMESTIC_"));
  const incoterms = allTerms.filter((t) => !t.startsWith("DOMESTIC_"));

  const needsDays = ["DEFERRED", "CHEQUE", "SENET"].includes(value.paymentCategory) || (value.paymentCategory === "LETTER_OF_CREDIT" && value.lcType === "USANCE");
  const gap = compact ? "space-y-5" : "space-y-8";

  return (
    <BareContext.Provider value={bare}>
    <div className={gap}>
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
                    {countryDisplayName(c, locale)}
                    <button
                      type="button"
                      aria-label={tr("ulkesiniCikar", { countryName: countryDisplayName(c, locale) })}
                      onClick={() => set({ targetCountries: countries.filter((x) => x !== c) })}
                      className="text-blue-400 hover:text-blue-700"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <select
                aria-label={tr("ulkeEkle")}
                value=""
                onChange={(e) => {
                  const code = e.target.value;
                  if (code && !countries.includes(code)) set({ targetCountries: [...countries, code] });
                }}
                className={INPUT}
              >
                <option value="">{tr("ulkeEkle2")}</option>
                {COUNTRIES.filter((c) => !countries.includes(c.code)).map((c) => (
                  <option key={c.code} value={c.code}>
                    {countryDisplayName(c.code, locale)}
                  </option>
                ))}
              </select>
              {countries.length === 0 ? <p className="text-xs text-red-700">{tr("enAzBirUlkeSecin")}</p> : null}
            </div>
          ) : null}
        </Block>
      ) : null}

      {show("delivery") ? (
        <Field>
          <Label htmlFor="tsart-teslim">{tr("teslimSekli")}</Label>
          <select id="tsart-teslim" value={value.deliveryTerm ?? ""} onChange={(e) => set({ deliveryTerm: e.target.value || null })} className={INPUT}>
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
            {PAYMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {paymentCategoryLabel(c)}
              </option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {value.paymentCategory === "ADVANCE" ? (
              <Field hint={tr("n100TamPesinAltiKismi")}>
                <Label htmlFor="tsart-pesin">{tr("pesinYuzdesi")}</Label>
                <input id="tsart-pesin" type="number" min={1} max={100} value={value.advancePercent ?? 100} onChange={(e) => set({ advancePercent: Number(e.target.value) || null })} className={INPUT} />
              </Field>
            ) : null}
            {value.paymentCategory === "LETTER_OF_CREDIT" ? (
              <Field>
                <Label htmlFor="tsart-lc">{tr("akreditifTipi")}</Label>
                <select id="tsart-lc" value={value.lcType ?? "SIGHT"} onChange={(e) => set({ lcType: e.target.value })} className={INPUT}>
                  {(["SIGHT", "USANCE"] as LcSubType[]).map((t) => (
                    <option key={t} value={t}>{lcTypeLabel(t)}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            {needsDays ? (
              <Field>
                <Label htmlFor="tsart-vade" required>{tr("vadeGun")}</Label>
                <input id="tsart-vade" type="number" min={1} max={365} value={value.paymentDays ?? ""} onChange={(e) => set({ paymentDays: Number(e.target.value) || null })} className={INPUT} />
              </Field>
            ) : null}
          </div>
        </Block>
      ) : null}

      {show("currency") ? (
        <Block title={tr("paraBirimi")} hint={tr("anaBirimTeklifKarsilastirmasininTabanidir")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <Label htmlFor="tsart-para">{tr("anaParaBirimi")}</Label>
              <select
                id="tsart-para"
                value={value.primaryCurrency}
                onChange={(e) => {
                  const c = e.target.value;
                  set({ primaryCurrency: c, allowedCurrencies: value.allowedCurrencies.includes(c) ? value.allowedCurrencies : [c, ...value.allowedCurrencies] });
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
              <Label as="p" id="tsart-birimler-baslik">{tr("kabulEdilenBirimler")}</Label>
              <div role="group" aria-labelledby="tsart-birimler-baslik" className="flex flex-wrap gap-1.5">
                {CURRENCIES.map((c) => {
                  const on = value.allowedCurrencies.includes(c);
                  const locked = c === value.primaryCurrency;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={locked}
                      aria-pressed={on}
                      onClick={() => set({ allowedCurrencies: on ? value.allowedCurrencies.filter((x) => x !== c) : [...value.allowedCurrencies, c] })}
                      className={cn("rounded-md px-2 py-1 text-xs font-medium ring-1 transition", on ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50", locked && "opacity-70")}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
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
              <button key={d} type="button" aria-pressed={value.closeDays === d} onClick={() => set({ closeDays: d })} className={cn("rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition", value.closeDays === d ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50")}>
                {tr("gun", { d: d })}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input type="number" min={1} max={REQUEST_CLOSE_DAYS_MAX} value={value.closeDays} onChange={(e) => set({ closeDays: Math.min(REQUEST_CLOSE_DAYS_MAX, Math.max(1, Number(e.target.value) || 1)) })} className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" aria-label={tr("ozelGunSayisi")} />
              {tr("gun2")}
            </label>
          </div>
        </Block>
      ) : null}

      {show("bids") ? (
        <Block title={tr("teklifKurallari")} hint={tr("kapaliZarfTedarikcilerBirbirininTeklifini")}>
          <div className="space-y-3">
            <Toggle label={tr("kapaliZarf")} checked={value.isSealedBid} onChange={(v) => set({ isSealedBid: v })} />
            <Field>
              <Label htmlFor="tsart-gorunur">{tr("tedarikciNeGorur")}</Label>
              <select id="tsart-gorunur" value={value.bidVisibility} onChange={(e) => set({ bidVisibility: e.target.value })} className={INPUT}>
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
    </div>
    </BareContext.Provider>
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
