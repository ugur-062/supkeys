"use client";

import { Button } from "@/components/ui/button";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import { COMPANY_TYPE_LABEL } from "@/lib/supplier/membership";
import { cn } from "@/lib/utils";
import { Award, ExternalLink, Sparkles } from "lucide-react";

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-brand-900 break-words">{children}</dd>
    </div>
  );
}

export function CompanyInfoCard() {
  const { supplier } = useSupplierAuth();
  if (!supplier) return null;

  const isPremium = supplier.membership === "PREMIUM";

  return (
    <section className="card p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-900">
            Firma Bilgileri
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Düzenleme V2'de aktif olacak — şu an salt görünüm.
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled title="V2'de aktif olacak">
          Düzenle
          <span className="ml-1 px-1.5 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-semibold uppercase tracking-wide">
            Yakında
          </span>
        </Button>
      </div>

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoRow label="Firma Adı">{supplier.companyName}</InfoRow>
        <InfoRow label="Firma Tipi">
          {COMPANY_TYPE_LABEL[supplier.companyType]}
        </InfoRow>
        <InfoRow label="Vergi Numarası">
          <span className="font-mono">{supplier.taxNumber}</span>
        </InfoRow>
        <InfoRow label="Vergi Dairesi">{supplier.taxOffice}</InfoRow>
        <InfoRow label="Sektör">{supplier.industry || "—"}</InfoRow>
        <InfoRow label="Web Sitesi">
          {supplier.website ? (
            <a
              href={supplier.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand-700 hover:underline"
            >
              {supplier.website}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            "—"
          )}
        </InfoRow>
      </dl>

      <div className="pt-5 border-t border-surface-border space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Adres
        </h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="İl / İlçe">
            {supplier.city} / {supplier.district}
          </InfoRow>
          {supplier.postalCode && (
            <InfoRow label="Posta Kodu">
              <span className="font-mono">{supplier.postalCode}</span>
            </InfoRow>
          )}
          <div className="md:col-span-2">
            <InfoRow label="Açık Adres">
              <span className="whitespace-pre-wrap">
                {supplier.addressLine}
              </span>
            </InfoRow>
          </div>
        </dl>
      </div>

      <div className="pt-5 border-t border-surface-border space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Üyelik
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border",
            isPremium
              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
              : "bg-slate-100 text-slate-600 border-slate-200",
          )}
        >
          <Award className="h-3.5 w-3.5" />
          {isPremium ? "Premium" : "Standart"} Üyelik
        </span>

        {!isPremium && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-brand-900 text-sm">
                  Premium üyelik avantajları
                </p>
                <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside mt-2 marker:text-brand-300">
                  <li>Tüm açık ihalelere teklif verebilme</li>
                  <li>Tedarikçi havuzunda öne çıkma</li>
                  <li>Detaylı performans raporları</li>
                </ul>
              </div>
            </div>
            <Button variant="secondary" size="sm" disabled>
              Premium'a Yükselt (Yakında)
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 pt-4 border-t border-surface-border">
        Firma bilgilerini düzenlemek için{" "}
        <a
          href="mailto:support@supkeys.com"
          className="text-brand-700 hover:underline"
        >
          support@supkeys.com
        </a>{" "}
        ile iletişime geçin.
      </p>
    </section>
  );
}
