"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { LogisticsInfoCard } from "@/components/tenders/logistics-info";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { useTenantAddresses } from "@/hooks/use-tenant-addresses";
import { useSuppliers } from "@/hooks/use-tenant-suppliers";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type { TenderLogisticsDetails } from "@/lib/tenders/types";
import {
  CURRENCY_SYMBOL,
  DELIVERY_TERM_LABELS,
  PAYMENT_TERM_LABELS,
} from "@/lib/tenders/labels";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, FileText, Paperclip, Pencil, Upload } from "lucide-react";
import { useFormContext } from "react-hook-form";

interface Props {
  onEditStep: (step: 1 | 2 | 3) => void;
  /** Step 1'de stage edilmiş, henüz yüklenmemiş dosyalar. Yayın sonrası R2'ye gider. */
  stagedFiles: File[];
}

function fmt(value: string | undefined | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d MMM yyyy, HH:mm", { locale: tr });
  } catch {
    return "—";
  }
}

function bytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-base text-brand-900">
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs text-brand-700 hover:text-brand-900 inline-flex items-center gap-1"
        >
          <Pencil className="w-3.5 h-3.5" />
          Düzenle
        </button>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 gap-3 py-2 text-sm">
      <span className="col-span-4 text-slate-500">{label}</span>
      <span className="col-span-8 text-brand-900">{value}</span>
    </div>
  );
}

export function Step4Review({ onEditStep, stagedFiles }: Props) {
  const { watch } = useFormContext<TenderFormData>();
  const data = watch();

  // Tedarikçi adlarını çekelim ki review'de gerçek isimler gözüksün
  const { data: suppliersData } = useSuppliers({
    status: "ACTIVE",
    pageSize: 100,
  });
  const supplierMap = new Map(
    (suppliersData?.items ?? []).map((s) => [s.supplier.id, s.supplier]),
  );

  const invitedSuppliers = (data.invitedSupplierIds ?? [])
    .map((id) => supplierMap.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  // Adres preview (ID → label)
  const billingQuery = useTenantAddresses({ type: "FATURA", activeOnly: true });
  const deliveryQuery = useTenantAddresses({
    type: "TESLIMAT",
    activeOnly: true,
  });
  const billingSel = billingQuery.data?.find(
    (a) => a.id === data.billingAddressId,
  );
  const deliverySel = deliveryQuery.data?.find(
    (a) => a.id === data.deliveryAddressId,
  );

  // V2-6 — kategoriler özeti backend breadcrumb'larından (multi).
  const categoryQuery = useCategoriesByIds(data.categoryIds ?? []);
  const categoryLabels = categoryQuery.data?.map((c) => c.breadcrumb) ?? [];

  // Lojistik İhalesi — form değerlerinden görüntüleme şekline adapte et.
  const lg = data.logistics;
  const logisticsForCard: TenderLogisticsDetails | null =
    data.isLogistics && lg?.transportMode
      ? {
          transportMode: lg.transportMode,
          originCity: lg.originCity ?? "",
          originDistrict: lg.originDistrict || null,
          originAddress: lg.originAddress || null,
          destinationCity: lg.destinationCity ?? "",
          destinationDistrict: lg.destinationDistrict || null,
          destinationAddress: lg.destinationAddress || null,
          cargoType: lg.cargoType ?? "",
          weightKg: lg.weightKg ?? null,
          volumeM3: lg.volumeM3 ?? null,
          packageCount: lg.packageCount ?? null,
          vehicleType: lg.vehicleType || null,
          loadingDate: lg.loadingDate || null,
          deliveryDate: lg.deliveryDate || null,
          hazardous: !!lg.hazardous,
          refrigerated: !!lg.refrigerated,
          fragile: !!lg.fragile,
          stackable: !!lg.stackable,
          notes: lg.notes || null,
        }
      : null;

  return (
    <div className="space-y-4">
      {logisticsForCard ? (
        <LogisticsInfoCard details={logisticsForCard} />
      ) : null}
      <div className="rounded-xl border border-success-200 bg-success-50/40 p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-success-900">
            İhale yayına hazır!
          </p>
          <p className="text-sm text-success-800/80 mt-0.5">
            Bilgileri kontrol edin. Yayınladıktan sonra kalemler ve davetli
            tedarikçiler değiştirilemez.
          </p>
        </div>
      </div>

      {/* İhale Bilgileri */}
      <Section title="İhale Bilgileri" onEdit={() => onEditStep(1)}>
        <Row
          label={categoryLabels.length > 1 ? "Kategoriler" : "Kategori"}
          value={
            categoryLabels.length === 0 ? (
              "—"
            ) : (
              <ul className="space-y-0.5">
                {categoryLabels.map((label, i) => (
                  <li key={i} className="text-sm">
                    {label}
                  </li>
                ))}
              </ul>
            )
          }
        />
        <Row label="Adı" value={data.title || "—"} />
        {data.description ? (
          <Row label="Açıklama" value={data.description} />
        ) : null}
        <Row label="Tip" value={data.type === "RFQ" ? "RFQ (Kapalı Teklif)" : "İngiliz Usulü"} />
        <Row
          label={
            data.allowedCurrencies && data.allowedCurrencies.length > 1
              ? "Para Birimleri"
              : "Para Birimi"
          }
          value={
            <div className="flex flex-wrap items-center gap-1.5">
              {(data.allowedCurrencies ?? [data.primaryCurrency]).map((c) => {
                const isPrimary = c === data.primaryCurrency;
                return (
                  <span
                    key={c}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${
                      isPrimary
                        ? "border-brand-500 bg-brand-50 text-brand-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {isPrimary ? "★ " : ""}
                    {CURRENCY_SYMBOL[c]} {c}
                  </span>
                );
              })}
            </div>
          }
        />
        <Row
          label="Kurallar"
          value={
            <>
              {data.type === "RFQ" && data.isSealedBid ? "Kapalı Zarf · " : ""}
              {data.requireAllItems ? "Tüm kalemler zorunlu · " : ""}
              {data.requireBidDocument ? "Dosya zorunlu" : ""}
              {(!data.isSealedBid || data.type === "ENGLISH_AUCTION") &&
              !data.requireAllItems &&
              !data.requireBidDocument
                ? "—"
                : ""}
            </>
          }
        />
        {data.type === "ENGLISH_AUCTION" ? (
          <>
            <Row
              label="Tedarikçi Görünürlüğü"
              value={
                {
                  OWN_ONLY: "Sadece kendi teklifi",
                  BEST_PRICE: "Sadece en iyi teklif",
                  OWN_RANK: "Sadece kendi sıralaması",
                  BEST_AND_OWN_RANK: "En iyi teklif + kendi sıralaması",
                  ALL: "Tüm teklifler ve sıralama",
                }[data.bidVisibility] ?? "—"
              }
            />
            <Row
              label="Min. Fiyat Azaltma"
              value={
                data.priceDecrementType && data.priceDecrementValue != null
                  ? data.priceDecrementType === "PERCENT"
                    ? `%${data.priceDecrementValue} (kendi son teklifine göre)`
                    : `${data.priceDecrementValue} ${data.primaryCurrency} (kendi son teklifine göre)`
                  : "—"
              }
            />
            <Row label="Ondalık Basamak" value={String(data.decimalPlaces)} />
            {data.sendClosingReminder ? (
              <Row
                label="Kapanış Hatırlatma"
                value={`Kapanışa ${data.reminderMinutesBefore ?? 60} dk kala e-posta`}
              />
            ) : null}
            {data.autoExtendOnLateBid ? (
              <Row
                label="Süre Uzatma"
                value={`Son ${data.autoExtendThresholdMin ?? 2} dk içinde teklif gelirse ${data.autoExtendByMinutes ?? 2} dk uzatılır`}
              />
            ) : null}
          </>
        ) : null}
        {data.deliveryTerm ? (
          <Row
            label="Teslim Şekli"
            value={DELIVERY_TERM_LABELS[data.deliveryTerm]}
          />
        ) : null}
        {billingSel ? (
          <Row
            label="Fatura Adresi"
            value={`${billingSel.title} — ${billingSel.city} / ${billingSel.district}`}
          />
        ) : null}
        {deliverySel ? (
          <Row
            label="Teslimat Adresi"
            value={`${deliverySel.title} — ${deliverySel.city} / ${deliverySel.district}`}
          />
        ) : null}
        <Row
          label="Ödeme"
          value={
            <>
              {PAYMENT_TERM_LABELS[data.paymentTerm]}
              {data.paymentTerm === "DEFERRED" && data.paymentDays
                ? ` (${data.paymentDays} gün)`
                : ""}
            </>
          }
        />
        <Row label="Açılış" value={fmt(data.bidsOpenAt) === "—" ? "Yayınlanır anda" : fmt(data.bidsOpenAt)} />
        <Row label="Kapanış" value={fmt(data.bidsCloseAt)} />
      </Section>

      {/* Kalemler */}
      <Section title={`Kalemler (${data.items.length})`} onEdit={() => onEditStep(2)}>
        <div className="[--gutter:--spacing(0)]">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>#</TableHeader>
                <TableHeader>Kalem</TableHeader>
                <TableHeader className="text-right">Miktar</TableHeader>
                <TableHeader>Birim</TableHeader>
                <TableHeader>Soru</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-zinc-500">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium text-zinc-900">
                      {item.name || "—"}
                    </div>
                    {item.materialCode ? (
                      <div className="text-xs text-zinc-500 font-mono">
                        {item.materialCode}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.quantity}
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {(item.questions && item.questions.length > 0) ||
                    item.customQuestion
                      ? `✓${
                          item.questions && item.questions.length > 0
                            ? ` (${item.questions.length})`
                            : ""
                        }`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* İhale Dökümanları — Step 1'de stage edilmiş dosyalar (V2-2) */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-base text-brand-900">
              İhale Dökümanları ({stagedFiles.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onEditStep(1)}
            className="text-xs text-brand-700 hover:text-brand-900 inline-flex items-center gap-1"
          >
            <Pencil className="w-3.5 h-3.5" />
            Düzenle
          </button>
        </header>
        <div className="px-5 py-4 space-y-3">
          {stagedFiles.length === 0 ? (
            <p className="text-xs text-slate-500">
              Dosya eklenmedi. Adım 1'deki "Dosyalar" bölümünden ekleyebilirsiniz.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-50/40 border border-brand-100 text-xs text-brand-900">
                <Upload className="w-4 h-4 flex-shrink-0 mt-0.5 text-brand-700" />
                <span>
                  Bu dosyalar yayınladığınızda otomatik olarak yüklenir.
                </span>
              </div>
              <ul className="space-y-2">
                {stagedFiles.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-white"
                  >
                    <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="text-sm text-brand-900 truncate flex-1">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {bytes(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Tedarikçiler */}
      <Section
        title={`Davetli Tedarikçiler (${data.invitedSupplierIds.length})`}
        onEdit={() => onEditStep(3)}
      >
        {invitedSuppliers.length === 0 ? (
          <p className="text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
            Henüz tedarikçi seçmediniz. Yayınlamak için en az 1 tedarikçi
            gerekiyor.
          </p>
        ) : (
          <ul className="space-y-2">
            {invitedSuppliers.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-1.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-brand-900 truncate">
                    {s.companyName}
                  </p>
                  <p className="text-xs text-slate-500">
                    VKN: <span className="font-mono">{s.taxNumber}</span>
                  </p>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">
                  {s.users[0]?.email ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
