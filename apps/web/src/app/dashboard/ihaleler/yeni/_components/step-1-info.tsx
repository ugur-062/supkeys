"use client";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
} from "@/lib/tenders/labels";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type { Currency, DeliveryTerm } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { Calendar, Clock, FileText, Info, Truck, Wallet } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { FileUploadMulti } from "./file-upload-multi";

const CURRENCIES: Currency[] = ["TRY", "USD", "EUR"];
const DELIVERY_TERMS: DeliveryTerm[] = [
  "EXW",
  "FCA",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
];

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Info;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-brand-700" />
      </div>
      <div>
        <h3 className="font-display font-bold text-base text-brand-900">
          {title}
        </h3>
        {description ? (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function Step1Info() {
  const {
    register,
    control,
    formState: { errors },
    watch,
  } = useFormContext<TenderFormData>();

  const paymentTerm = watch("paymentTerm");
  const allowedCurrencies = watch("allowedCurrencies");

  return (
    <div className="space-y-8">
      {/* SECTION: Genel Bilgiler */}
      <section>
        <SectionHeader
          icon={Info}
          title="Genel Bilgiler"
          description="İhalenize ad verin ve kısaca tanımlayın."
        />
        <div className="space-y-4">
          <Field error={errors.title?.message}>
            <Label htmlFor="title" required>
              İhale Adı
            </Label>
            <Input
              id="title"
              placeholder="Örn. 2026 Q3 IT Sarf Malzeme Alımı"
              hasError={!!errors.title}
              {...register("title")}
            />
          </Field>

          <Field error={errors.description?.message}>
            <Label htmlFor="description">Açıklama</Label>
            <Textarea
              id="description"
              rows={3}
              placeholder="İhalenin amacı, kapsamı, özel gereksinimler…"
              hasError={!!errors.description}
              {...register("description")}
            />
          </Field>

          <Field>
            <Label>İhale Tipi</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                  "border-brand-500 bg-brand-50/40",
                )}
              >
                <input
                  type="radio"
                  value="RFQ"
                  className="mt-0.5"
                  {...register("type")}
                />
                <div>
                  <p className="text-sm font-semibold text-brand-900">
                    RFQ (Kapalı Teklif)
                  </p>
                  <p className="text-xs text-slate-500">
                    Tedarikçiler birbirini görmez. Süre dolunca teklifler açılır.
                  </p>
                </div>
              </label>
              <label
                className="flex items-start gap-3 p-3 rounded-lg border-2 border-slate-200 cursor-not-allowed opacity-60"
                title="V2'de aktif olacak"
              >
                <input type="radio" value="ENGLISH_AUCTION" disabled />
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    İngiliz Usulü{" "}
                    <span className="ml-1 px-1.5 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-semibold uppercase">
                      Yakında
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Açık eksiltme, canlı teklif yarışması.
                  </p>
                </div>
              </label>
            </div>
          </Field>
        </div>
      </section>

      {/* SECTION: İhale Kuralları */}
      <section>
        <SectionHeader
          icon={FileText}
          title="İhale Kuralları"
          description="Tedarikçilerin teklif verme şeklini belirleyin."
        />
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              className="mt-0.5"
              {...register("isSealedBid")}
            />
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Kapalı Zarf (varsayılan)
              </p>
              <p className="text-xs text-slate-500">
                Tedarikçiler birbirinin tekliflerini görmez. Süre dolunca tüm
                teklifler size açılır.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              className="mt-0.5"
              {...register("requireAllItems")}
            />
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Tüm kalemlere teklif zorunlu
              </p>
              <p className="text-xs text-slate-500">
                Tedarikçi tek bir kaleme teklif veremez; tümüne fiyat girmek
                zorundadır.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              className="mt-0.5"
              {...register("requireBidDocument")}
            />
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Teklif dosyası zorunlu
              </p>
              <p className="text-xs text-slate-500">
                Tedarikçi teklifi gönderirken en az 1 dosya yüklemelidir.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* SECTION: Para Ayarları */}
      <section>
        <SectionHeader
          icon={Wallet}
          title="Para Birimi"
          description="Hangi para birimleriyle teklif kabul edilecek?"
        />
        <div className="space-y-4">
          <Field error={errors.primaryCurrency?.message}>
            <Label required>Ana Para Birimi</Label>
            <div className="grid grid-cols-3 gap-3">
              {CURRENCIES.map((c) => (
                <label
                  key={c}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                    "has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/40",
                    "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <input
                    type="radio"
                    value={c}
                    {...register("primaryCurrency")}
                  />
                  <span className="text-sm font-semibold text-brand-900">
                    {CURRENCY_SYMBOL[c]} {c}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Controller
            control={control}
            name="allowedCurrencies"
            render={({ field, fieldState }) => (
              <Field
                error={fieldState.error?.message}
                hint="Ana para birimi otomatik dahildir."
              >
                <Label>İzin Verilen Para Birimleri</Label>
                <div className="grid grid-cols-3 gap-3">
                  {CURRENCIES.map((c) => {
                    const checked = field.value?.includes(c);
                    return (
                      <label
                        key={c}
                        className={cn(
                          "flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                          checked
                            ? "border-brand-500 bg-brand-50/40"
                            : "border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked ?? false}
                          onChange={(e) => {
                            const set = new Set(field.value ?? []);
                            if (e.target.checked) set.add(c);
                            else set.delete(c);
                            field.onChange(Array.from(set));
                          }}
                        />
                        <span className="text-sm font-semibold text-brand-900">
                          {CURRENCY_SYMBOL[c]} {c}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}
          />

          <Field error={errors.decimalPlaces?.message}>
            <Label htmlFor="decimalPlaces">Ondalık Basamak</Label>
            <select
              id="decimalPlaces"
              className="w-full px-3.5 py-2.5 rounded-lg border border-surface-border bg-white text-sm"
              {...register("decimalPlaces", { valueAsNumber: true })}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} basamak
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-50/40 border border-brand-100 text-xs text-slate-600">
            <Info className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
            <p>
              TCMB kur dönüşümü V2&apos;de gelecek. V1&apos;de teklifler kendi
              para biriminde gösterilir; karşılaştırma manueldir. Seçili para
              birimleri:{" "}
              <strong>{(allowedCurrencies ?? []).join(", ") || "—"}</strong>
            </p>
          </div>
        </div>
      </section>

      {/* SECTION: Teslimat */}
      <section>
        <SectionHeader
          icon={Truck}
          title="Teslimat"
          description="Teslim şekli ve adresi (Incoterms 2020)"
        />
        <div className="space-y-4">
          <Field error={errors.deliveryTerm?.message}>
            <Label htmlFor="deliveryTerm">Teslim Şekli</Label>
            <select
              id="deliveryTerm"
              className="w-full px-3.5 py-2.5 rounded-lg border border-surface-border bg-white text-sm"
              {...register("deliveryTerm")}
            >
              <option value="">— Seçiniz —</option>
              {DELIVERY_TERMS.map((t) => (
                <option key={t} value={t}>
                  {DELIVERY_TERM_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field error={errors.deliveryAddress?.message}>
            <Label htmlFor="deliveryAddress">Teslimat Adresi</Label>
            <Textarea
              id="deliveryAddress"
              rows={2}
              placeholder="Tedarikçilere iletilecek teslim noktası, depo, fabrika…"
              hasError={!!errors.deliveryAddress}
              {...register("deliveryAddress")}
            />
          </Field>
        </div>
      </section>

      {/* SECTION: Ödeme */}
      <section>
        <SectionHeader
          icon={Wallet}
          title="Ödeme Koşulları"
          description="Faturanın nasıl ödeneceğini belirtin."
        />
        <div className="space-y-4">
          <Field error={errors.paymentTerm?.message}>
            <Label required>Ödeme Tipi</Label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/40 border-slate-200 hover:bg-slate-50">
                <input
                  type="radio"
                  value="CASH"
                  {...register("paymentTerm")}
                />
                <span className="text-sm font-semibold text-brand-900">
                  Peşin
                </span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/40 border-slate-200 hover:bg-slate-50">
                <input
                  type="radio"
                  value="DEFERRED"
                  {...register("paymentTerm")}
                />
                <span className="text-sm font-semibold text-brand-900">
                  Vadeli
                </span>
              </label>
            </div>
          </Field>

          {paymentTerm === "DEFERRED" ? (
            <Field
              error={errors.paymentDays?.message}
              hint="Faturayı kaç gün vadede ödeyeceksiniz?"
            >
              <Label htmlFor="paymentDays" required>
                Vade Gün Sayısı
              </Label>
              <Input
                id="paymentDays"
                type="number"
                min={1}
                max={365}
                placeholder="30"
                hasError={!!errors.paymentDays}
                {...register("paymentDays", {
                  setValueAs: (v) =>
                    v === "" || v === undefined ? undefined : Number(v),
                })}
              />
            </Field>
          ) : null}
        </div>
      </section>

      {/* SECTION: Hüküm/Notlar */}
      <section>
        <SectionHeader
          icon={FileText}
          title="Hüküm, Koşullar & Notlar"
          description="Tedarikçiye iletilecek ek bilgiler."
        />
        <div className="space-y-4">
          <Field
            error={errors.termsAndConditions?.message}
            hint="Tedarikçilere açık metin olarak gösterilir."
          >
            <Label htmlFor="termsAndConditions">Hüküm ve Koşullar</Label>
            <Textarea
              id="termsAndConditions"
              rows={3}
              placeholder="Garanti, iade, gecikme cezası, KDV durumu…"
              hasError={!!errors.termsAndConditions}
              {...register("termsAndConditions")}
            />
          </Field>

          <Field
            error={errors.internalNotes?.message}
            hint="Sadece kendi ekibiniz görür, tedarikçiye iletilmez."
          >
            <Label htmlFor="internalNotes">Dahili Notlar (özel)</Label>
            <Textarea
              id="internalNotes"
              rows={2}
              placeholder="Bütçe, hedef fiyat aralığı, pazarlık notları…"
              hasError={!!errors.internalNotes}
              {...register("internalNotes")}
            />
          </Field>
        </div>
      </section>

      {/* SECTION: Zaman */}
      <section>
        <SectionHeader
          icon={Calendar}
          title="Açılış / Kapanış"
          description="Tedarikçiler ne zamandan ne zamana kadar teklif verebilecek?"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            error={errors.bidsOpenAt?.message}
            hint="Boş bırakılırsa yayınlanır anda açılır."
          >
            <Label htmlFor="bidsOpenAt">Açılış Tarihi</Label>
            <Input
              id="bidsOpenAt"
              type="datetime-local"
              hasError={!!errors.bidsOpenAt}
              {...register("bidsOpenAt")}
            />
          </Field>
          <Field error={errors.bidsCloseAt?.message}>
            <Label htmlFor="bidsCloseAt" required>
              Kapanış Tarihi
            </Label>
            <Input
              id="bidsCloseAt"
              type="datetime-local"
              hasError={!!errors.bidsCloseAt}
              {...register("bidsCloseAt")}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <Clock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
          <p>
            Kapanış tarihinden sonra teklif kabul edilmez ve ihale kazandırma
            aşamasına geçer.
          </p>
        </div>
      </section>

      {/* SECTION: Dosyalar */}
      <section>
        <SectionHeader
          icon={FileText}
          title="Dosyalar (opsiyonel)"
          description="Şartname, teknik resim, model dosyaları…"
        />
        <Controller
          control={control}
          name="attachments"
          render={({ field }) => (
            <FileUploadMulti
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
      </section>
    </div>
  );
}
