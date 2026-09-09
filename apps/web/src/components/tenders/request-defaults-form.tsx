"use client";

import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useAddresses } from "@/hooks/use-company-addresses";
import { deliveryTermsFor, paymentCategoriesFor } from "@/lib/tenders/request-defaults";
import {
  CURRENCIES,
  CURRENCY_NAMES,
  DELIVERY_TERM_LABELS,
  LC_TYPE_LABELS,
  PAYMENT_CATEGORY_LABELS,
} from "@/lib/tenders/labels";
import type { Currency, DeliveryTerm, LcSubType, PaymentCategory } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { REQUEST_CLOSE_DAY_OPTIONS, REQUEST_CLOSE_DAYS_MAX, type RequestDefaults } from "@rothern/shared";
import { Globe, MapPin } from "lucide-react";

const INPUT =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";

export const BID_VISIBILITY_LABELS: Record<string, string> = {
  OWN_ONLY: "Tedarikçi yalnız kendi teklifini görür",
  BEST_PRICE: "Tedarikçi en iyi teklifi görür",
  OWN_RANK: "Tedarikçi yalnız kendi sıralamasını görür (önerilen)",
  BEST_AND_OWN_RANK: "En iyi teklif + kendi sıralaması",
  ALL: "Tüm teklifler ve sıralama açık",
};

export const VISIBILITY_LABELS: Record<string, { label: string; hint: string }> = {
  PUBLIC: { label: "Herkese açık", hint: "Pazar yerinde listelenir; kayıtlı her tedarikçi teklif verebilir." },
  CONNECTIONS: { label: "Bağlantılarım", hint: "Yalnız bağlı olduğunuz firmalar görür." },
  PRIVATE: { label: "Seçtiklerim", hint: "Yalnız davet ettiğiniz firmalar görür." },
};

/**
 * TALEP ŞARTLARI FORMU — ticari profil (2026-09-09).
 *
 * İki yerde aynı bileşen: Şablonlar › Talep Şartları sayfası ve hızlı talep
 * kartındaki "değiştir" paneli (`compact`). Kapsam değişince teslim şekli ve
 * ödeme listeleri süzülür ve tutarsız kalan seçim temizlenir — sihirbazdaki
 * kurallarla (form-schema refine'ları) aynı.
 */
export function RequestDefaultsForm({
  value,
  onChange,
  compact = false,
  only,
}: {
  value: RequestDefaults;
  onChange: (next: RequestDefaults) => void;
  compact?: boolean;
  /** Yalnız bu bölümler çizilir (hızlı kartta tek satır düzenleme). */
  only?: ("scope" | "delivery" | "payment" | "currency" | "visibility" | "close" | "bids" | "address" | "rules")[];
}) {
  const addresses = useAddresses();
  const show = (k: NonNullable<typeof only>[number]) => !only || only.includes(k);
  const set = (patch: Partial<RequestDefaults>) => onChange({ ...value, ...patch });

  const setScope = (isInternational: boolean) => {
    const terms = deliveryTermsFor(isInternational, Object.keys(DELIVERY_TERM_LABELS));
    const cats = paymentCategoriesFor(isInternational);
    set({
      isInternational,
      deliveryTerm: value.deliveryTerm && terms.includes(value.deliveryTerm) ? value.deliveryTerm : null,
      paymentCategory: cats.includes(value.paymentCategory) ? value.paymentCategory : isInternational ? "ADVANCE" : "OPEN_ACCOUNT",
      advancePercent: isInternational ? null : value.advancePercent,
      lcType: isInternational ? value.lcType : null,
    });
  };

  const needsDays = ["DEFERRED", "CHEQUE", "SENET"].includes(value.paymentCategory) || (value.paymentCategory === "LETTER_OF_CREDIT" && value.lcType === "USANCE");
  const gap = compact ? "space-y-5" : "space-y-8";

  return (
    <div className={gap}>
      {show("scope") ? (
        <Block title="Kapsam" hint="Teslim şekli ve ödeme seçenekleri kapsama göre süzülür.">
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: false, icon: MapPin, label: "Yurtiçi" },
              { v: true, icon: Globe, label: "Uluslararası" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => setScope(o.v)}
                aria-pressed={value.isInternational === o.v}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition",
                  value.isInternational === o.v ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-800 hover:bg-zinc-50",
                )}
              >
                <o.icon aria-hidden className="size-4" />
                {o.label}
              </button>
            ))}
          </div>
        </Block>
      ) : null}

      {show("delivery") ? (
        <Field>
          <Label>Teslim şekli</Label>
          <select value={value.deliveryTerm ?? ""} onChange={(e) => set({ deliveryTerm: e.target.value || null })} className={INPUT}>
            <option value="">— Seçin —</option>
            {deliveryTermsFor(value.isInternational, Object.keys(DELIVERY_TERM_LABELS)).map((t) => (
              <option key={t} value={t}>
                {DELIVERY_TERM_LABELS[t as DeliveryTerm]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {show("payment") ? (
        <Block title="Ödeme koşulu" hint="Tedarikçi teklifini bu koşula göre verir; sipariş adımları buradan türer.">
          <select
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
            {paymentCategoriesFor(value.isInternational).map((c) => (
              <option key={c} value={c}>
                {PAYMENT_CATEGORY_LABELS[c as PaymentCategory]}
              </option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {value.paymentCategory === "ADVANCE" && !value.isInternational ? (
              <Field hint="100 = tam peşin; altı kısmi peşin (kalan teslimde).">
                <Label>Peşin yüzdesi</Label>
                <input type="number" min={1} max={100} value={value.advancePercent ?? 100} onChange={(e) => set({ advancePercent: Number(e.target.value) || null })} className={INPUT} />
              </Field>
            ) : null}
            {value.paymentCategory === "LETTER_OF_CREDIT" ? (
              <Field>
                <Label>Akreditif tipi</Label>
                <select value={value.lcType ?? "SIGHT"} onChange={(e) => set({ lcType: e.target.value })} className={INPUT}>
                  {(["SIGHT", "USANCE"] as LcSubType[]).map((t) => (
                    <option key={t} value={t}>{LC_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            {needsDays ? (
              <Field>
                <Label required>Vade (gün)</Label>
                <input type="number" min={1} max={365} value={value.paymentDays ?? ""} onChange={(e) => set({ paymentDays: Number(e.target.value) || null })} className={INPUT} />
              </Field>
            ) : null}
          </div>
        </Block>
      ) : null}

      {show("currency") ? (
        <Block title="Para birimi" hint="Ana birim teklif karşılaştırmasının tabanıdır; diğerleri izinli.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <Label>Ana para birimi</Label>
              <select
                value={value.primaryCurrency}
                onChange={(e) => {
                  const c = e.target.value;
                  set({ primaryCurrency: c, allowedCurrencies: value.allowedCurrencies.includes(c) ? value.allowedCurrencies : [c, ...value.allowedCurrencies] });
                }}
                className={INPUT}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c} — {CURRENCY_NAMES[c as Currency]}</option>
                ))}
              </select>
            </Field>
            <div>
              <Label>Kabul edilen birimler</Label>
              <div className="flex flex-wrap gap-1.5">
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
        <Block title="Kimler görsün" hint="Talebin varsayılan görünürlüğü; her talepte değiştirilebilir.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["PUBLIC", "CONNECTIONS", "PRIVATE"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set({ visibility: v })}
                aria-pressed={value.visibility === v}
                className={cn("rounded-xl border p-3 text-left transition", value.visibility === v ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-300 hover:bg-zinc-50")}
              >
                <p className="text-sm font-semibold text-zinc-950">{VISIBILITY_LABELS[v].label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{VISIBILITY_LABELS[v].hint}</p>
              </button>
            ))}
          </div>
        </Block>
      ) : null}

      {show("close") ? (
        <Block title="Teklif toplama süresi" hint="Kapanış = yayın + bu kadar gün.">
          <div className="flex flex-wrap items-center gap-2">
            {REQUEST_CLOSE_DAY_OPTIONS.map((d) => (
              <button key={d} type="button" aria-pressed={value.closeDays === d} onClick={() => set({ closeDays: d })} className={cn("rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition", value.closeDays === d ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50")}>
                {d} gün
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input type="number" min={1} max={REQUEST_CLOSE_DAYS_MAX} value={value.closeDays} onChange={(e) => set({ closeDays: Math.min(REQUEST_CLOSE_DAYS_MAX, Math.max(1, Number(e.target.value) || 1)) })} className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" aria-label="Özel gün sayısı" />
              gün
            </label>
          </div>
        </Block>
      ) : null}

      {show("bids") ? (
        <Block title="Teklif kuralları" hint="Kapalı zarf: tedarikçiler birbirinin teklifini görmez.">
          <div className="space-y-3">
            <Toggle label="Kapalı zarf" checked={value.isSealedBid} onChange={(v) => set({ isSealedBid: v })} />
            <Field>
              <Label>Tedarikçi ne görür</Label>
              <select value={value.bidVisibility} onChange={(e) => set({ bidVisibility: e.target.value })} className={INPUT}>
                {Object.entries(BID_VISIBILITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
          </div>
        </Block>
      ) : null}

      {show("address") ? (
        <Block title="Teslimat adresi" hint="Varsayılan adres; her talepte değiştirilebilir.">
          <select value={value.deliveryAddressId ?? ""} onChange={(e) => set({ deliveryAddressId: e.target.value || null })} className={INPUT}>
            <option value="">— Talepte seçilir —</option>
            {(addresses.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}{a.city ? ` · ${a.city}` : ""}
              </option>
            ))}
          </select>
          <div className="mt-3">
            <Toggle label="Fatura adresi teslimat adresiyle aynı" checked={value.billingSameAsDelivery} onChange={(v) => set({ billingSameAsDelivery: v })} />
          </div>
        </Block>
      ) : null}

      {show("rules") ? (
        <Block title="Tekliften beklentiler">
          <div className="space-y-3">
            <Toggle label="Tüm kalemlere teklif zorunlu" checked={value.requireAllItems} onChange={(v) => set({ requireAllItems: v })} />
            <Toggle label="Teklifle birlikte belge zorunlu" checked={value.requireBidDocument} onChange={(v) => set({ requireBidDocument: v })} />
          </div>
        </Block>
      ) : null}
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      {hint ? <p className="mt-0.5 mb-3 text-xs text-zinc-500">{hint}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}

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
