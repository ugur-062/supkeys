"use client";

import { useCategoriesByIds } from "@/hooks/use-categories";
import { useTenantAddresses } from "@/hooks/use-tenant-addresses";
import { useSuppliers } from "@/hooks/use-tenant-suppliers";
import type { TenderFormData } from "@/lib/tenders/form-schema";
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
        <h3 className="font-display font-bold text-base text-brand-900">
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

  // V2-6 — kategori özeti backend breadcrumb'ından (4 seviye).
  const categoryQuery = useCategoriesByIds(
    data.categoryId ? [data.categoryId] : [],
  );
  const categoryLabel = categoryQuery.data?.[0]?.breadcrumb ?? null;

  return (
    <div className="space-y-4">
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
        <Row label="Kategori" value={categoryLabel ?? "—"} />
        <Row label="Adı" value={data.title || "—"} />
        {data.description ? (
          <Row label="Açıklama" value={data.description} />
        ) : null}
        <Row label="Tip" value={data.type === "RFQ" ? "RFQ (Kapalı Teklif)" : "İngiliz Usulü"} />
        <Row
          label="Para Birimi"
          value={
            <strong>
              {CURRENCY_SYMBOL[data.primaryCurrency]} {data.primaryCurrency}
            </strong>
          }
        />
        <Row
          label="Kurallar"
          value={
            <>
              {data.isSealedBid ? "Kapalı Zarf · " : ""}
              {data.requireAllItems ? "Tüm kalemler zorunlu · " : ""}
              {data.requireBidDocument ? "Dosya zorunlu" : ""}
              {!data.isSealedBid &&
              !data.requireAllItems &&
              !data.requireBidDocument
                ? "—"
                : ""}
            </>
          }
        />
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
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Kalem</th>
                <th className="py-2 pr-3 font-medium text-right">Miktar</th>
                <th className="py-2 pr-3 font-medium">Birim</th>
                <th className="py-2 font-medium">Soru</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-500">{idx + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium text-brand-900">
                      {item.name || "—"}
                    </div>
                    {item.materialCode ? (
                      <div className="text-xs text-slate-500 font-mono">
                        {item.materialCode}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-2 pr-3">{item.unit}</td>
                  <td className="py-2 text-xs text-slate-500">
                    {item.customQuestion ? "✓" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* İhale Dökümanları — Step 1'de stage edilmiş dosyalar (V2-2) */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-slate-500" />
            <h3 className="font-display font-bold text-base text-brand-900">
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
