"use client";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import {
  useCreateListing,
  type CurrencyCode,
  type ListingItemInput,
} from "@/hooks/use-company-listings";
import { useConnections } from "@/hooks/use-company-connections";
import { extractErrorMessage } from "@/lib/tenders/error";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const STEPS = ["Genel Bilgi", "Kalemler", "Tedarikçiler", "Özet & Yayınla"];
const CURRENCIES: CurrencyCode[] = ["TRY", "USD", "EUR", "GBP", "CHF", "JPY"];

export default function YeniIhalePage() {
  const router = useRouter();
  const create = useCreateListing();
  const connections = useConnections();
  const [step, setStep] = useState(0);

  // Adım 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<"RFQ" | "ENGLISH_AUCTION">("RFQ");
  const [isInternational, setIsInternational] = useState(false);
  const [visibility, setVisibility] = useState<
    "CONNECTIONS" | "PUBLIC" | "PRIVATE"
  >("CONNECTIONS");
  const [closesAt, setClosesAt] = useState("");
  const [primaryCurrency, setPrimaryCurrency] = useState<CurrencyCode>("TRY");
  const [extraCurrencies, setExtraCurrencies] = useState<CurrencyCode[]>([]);
  const [keywords, setKeywords] = useState("");
  const [terms, setTerms] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [requireAllItems, setRequireAllItems] = useState(false);
  const [requireBidDocument, setRequireBidDocument] = useState(false);

  // Adım 2
  const [items, setItems] = useState<ListingItemInput[]>([
    { name: "", quantity: 1, unit: "adet" },
  ]);

  // Adım 3
  const [invited, setInvited] = useState<string[]>([]);

  const conns = connections.data ?? [];
  const validItems = items.filter((i) => i.name.trim() && i.quantity > 0);

  const step1Ok = title.trim().length >= 3;
  const step2Ok = validItems.length > 0;
  const canPublish = step1Ok && step2Ok;

  const setItem = (idx: number, patch: Partial<ListingItemInput>) =>
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems((cur) => [...cur, { name: "", quantity: 1, unit: "adet" }]);
  const removeItem = (idx: number) =>
    setItems((cur) => cur.filter((_, i) => i !== idx));
  const toggleInvited = (code: string) =>
    setInvited((cur) =>
      cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
    );
  const toggleCurrency = (c: CurrencyCode) =>
    setExtraCurrencies((cur) =>
      cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
    );

  const publish = async () => {
    if (!canPublish) return;
    try {
      const kw = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);
      const allowed = Array.from(
        new Set<CurrencyCode>([primaryCurrency, ...extraCurrencies]),
      );
      const res = await create.mutateAsync({
        type: "ALIM",
        isInternational,
        format,
        visibility,
        title: title.trim(),
        description: description.trim() || undefined,
        closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
        items: validItems.map((i) => ({
          name: i.name.trim(),
          description: i.description?.trim() || undefined,
          quantity: Number(i.quantity),
          unit: i.unit.trim() || "adet",
          targetPrice:
            i.targetPrice != null && i.targetPrice > 0
              ? Number(i.targetPrice)
              : undefined,
        })),
        invitations: invited.length ? invited : undefined,
        keywords: kw.length ? kw : undefined,
        terms: terms.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
        requireAllItems,
        requireBidDocument,
        primaryCurrency,
        allowedCurrencies: allowed,
      });
      toast.success("İhale yayınlandı");
      router.push(`/company/ilan/${res.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İhale oluşturulamadı"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Heading>Yeni İhale</Heading>

      {/* Stepper */}
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i === step
                  ? "bg-blue-600 text-white"
                  : i < step
                    ? "bg-blue-100 text-blue-700"
                    : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {i + 1}
            </button>
            <span
              className={`hidden text-xs font-medium sm:block ${
                i === step ? "text-zinc-900" : "text-zinc-400"
              }`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="h-px flex-1 bg-zinc-200" />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-zinc-950/10 bg-white p-6">
        {/* ADIM 1 — Genel Bilgi */}
        {step === 0 ? (
          <div className="space-y-5">
            <Field>
              <Label>İhale başlığı</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn. Ofis malzemeleri alımı"
              />
            </Field>
            <Field>
              <Label>Açıklama (opsiyonel)</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <div>
              <Label>Format</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <ChoiceCard
                  active={format === "RFQ"}
                  onClick={() => setFormat("RFQ")}
                  title="RFQ — Teklif Toplama"
                  desc="Kapalı zarf; süre dolunca karşılaştır"
                />
                <ChoiceCard
                  active={format === "ENGLISH_AUCTION"}
                  onClick={() => setFormat("ENGLISH_AUCTION")}
                  title="İngiliz Usulü"
                  desc="Açık eksiltme; fiyat düşerek yarışır"
                />
              </div>
            </div>

            <div>
              <Label>Görünürlük</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["CONNECTIONS", "Bağlantılar"],
                    ["PRIVATE", "Sadece Davetli"],
                    ["PUBLIC", "Herkese Açık"],
                  ] as const
                ).map(([v, label]) => (
                  <ChoiceCard
                    key={v}
                    active={visibility === v}
                    onClick={() => setVisibility(v)}
                    title={label}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label>Kapanış tarihi (opsiyonel)</Label>
                <Input
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Ana para birimi</Label>
                <select
                  value={primaryCurrency}
                  onChange={(e) =>
                    setPrimaryCurrency(e.target.value as CurrencyCode)
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div>
              <Label>Ek kabul edilen para birimleri</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CURRENCIES.filter((c) => c !== primaryCurrency).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCurrency(c)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                      extraCurrencies.includes(c)
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-zinc-200 text-zinc-500"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <Field>
              <Label>Anahtar kelimeler (virgülle, en fazla 10)</Label>
              <Input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="ofis, kırtasiye, toner"
              />
            </Field>
            <Field>
              <Label>Şartlar ve koşullar (opsiyonel)</Label>
              <Textarea
                rows={2}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </Field>
            <Field>
              <Label>Dahili not (sadece firman görür)</Label>
              <Textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </Field>

            <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={requireAllItems}
                  onChange={setRequireAllItems}
                />
                Tüm kalemlere teklif zorunlu
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={requireBidDocument}
                  onChange={setRequireBidDocument}
                />
                Teklifte belge zorunlu
              </label>
            </div>
          </div>
        ) : null}

        {/* ADIM 2 — Kalemler */}
        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Subheading>Kalemler</Subheading>
              <Button outline onClick={addItem}>
                <PlusIcon data-slot="icon" />
                Kalem Ekle
              </Button>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-zinc-200 p-3"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs font-semibold text-zinc-400">
                      {idx + 1}
                    </span>
                    <div className="grid flex-1 grid-cols-12 gap-2">
                      <input
                        className="col-span-12 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm sm:col-span-5"
                        placeholder="Kalem adı"
                        value={it.name}
                        onChange={(e) => setItem(idx, { name: e.target.value })}
                      />
                      <input
                        type="number"
                        className="col-span-4 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm sm:col-span-2"
                        placeholder="Miktar"
                        value={it.quantity}
                        onChange={(e) =>
                          setItem(idx, { quantity: Number(e.target.value) })
                        }
                      />
                      <input
                        className="col-span-4 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm sm:col-span-2"
                        placeholder="Birim"
                        value={it.unit}
                        onChange={(e) => setItem(idx, { unit: e.target.value })}
                      />
                      <input
                        type="number"
                        className="col-span-4 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm sm:col-span-3"
                        placeholder="Hedef fiyat"
                        value={it.targetPrice ?? ""}
                        onChange={(e) =>
                          setItem(idx, {
                            targetPrice: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                    </div>
                    {items.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="mt-1.5 text-zinc-400 hover:text-red-600"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <Text className="text-xs text-zinc-400">
              En az bir geçerli kalem (ad + miktar) gerekir.
            </Text>
          </div>
        ) : null}

        {/* ADIM 3 — Tedarikçiler */}
        {step === 2 ? (
          <div className="space-y-4">
            <Subheading>Davet edilecek tedarikçiler</Subheading>
            {visibility === "PUBLIC" ? (
              <Text className="text-sm text-zinc-500">
                Herkese açık ihale — tüm premium tedarikçiler davet olmadan
                teklif verebilir. Ek olarak bağlı tedarikçilerini de davet
                edebilirsin.
              </Text>
            ) : (
              <Text className="text-sm text-zinc-500">
                İhaleye davet edilecek bağlı tedarikçilerini seç.
              </Text>
            )}
            {conns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center text-sm text-zinc-500">
                Henüz bağlı tedarikçin yok. Bağlantılar sayfasından firma
                ekleyebilirsin.
              </div>
            ) : (
              <div className="space-y-2">
                {conns.map((c) => {
                  const code = c.company.supkeysId ?? "";
                  const on = invited.includes(code);
                  return (
                    <label
                      key={c.connectionId}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                        on ? "border-blue-400 bg-blue-50" : "border-zinc-200"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">
                          {c.company.name}
                        </div>
                        <div className="font-mono text-xs text-zinc-500">
                          {code}
                        </div>
                      </div>
                      <Checkbox
                        checked={on}
                        onChange={() => code && toggleInvited(code)}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* ADIM 4 — Özet */}
        {step === 3 ? (
          <div className="space-y-4">
            <Subheading>Özet</Subheading>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <SummaryRow label="Başlık" value={title} />
              <SummaryRow
                label="Format"
                value={format === "RFQ" ? "RFQ" : "İngiliz Usulü"}
              />
              <SummaryRow
                label="Görünürlük"
                value={
                  visibility === "PUBLIC"
                    ? "Herkese Açık"
                    : visibility === "PRIVATE"
                      ? "Sadece Davetli"
                      : "Bağlantılar"
                }
              />
              <SummaryRow label="Para birimi" value={primaryCurrency} />
              <SummaryRow label="Kalem sayısı" value={String(validItems.length)} />
              <SummaryRow label="Davet" value={String(invited.length)} />
              <SummaryRow
                label="Kapsam"
                value={isInternational ? "Uluslararası" : "Yurtiçi"}
              />
              <SummaryRow
                label="Tüm kalem zorunlu"
                value={requireAllItems ? "Evet" : "Hayır"}
              />
            </dl>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="mb-1 text-xs font-semibold text-zinc-500">
                Kalemler
              </div>
              <ul className="space-y-1 text-sm">
                {validItems.map((it, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{it.name}</span>
                    <span className="text-zinc-500">
                      {it.quantity} {it.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      {/* Navigasyon */}
      <div className="flex items-center justify-between">
        <Button
          plain
          onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
        >
          {step === 0 ? "Vazgeç" : "Geri"}
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={(step === 0 && !step1Ok) || (step === 1 && !step2Ok)}
          >
            İleri
          </Button>
        ) : (
          <Button onClick={publish} disabled={!canPublish || create.isPending}>
            {create.isPending ? "Yayınlanıyor…" : "İhaleyi Yayınla"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${
        active
          ? "border-blue-500 bg-blue-50"
          : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      {desc ? <div className="mt-0.5 text-xs text-zinc-500">{desc}</div> : null}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-900">{value || "—"}</dd>
    </div>
  );
}
