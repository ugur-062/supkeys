"use client";

import { useTenantUserMe } from "@/hooks/use-tenant-users";
import { Building2, Loader2 } from "lucide-react";
import { BackToSettings } from "./back-to-settings";

export function FirmaProfiliView() {
  const meQuery = useTenantUserMe();

  if (meQuery.isLoading || !meQuery.data) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Yükleniyor…
      </div>
    );
  }

  const tenant = meQuery.data.tenant;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-brand-900">
                Firma Profili
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                Firma bilgileriniz.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center text-[11px] uppercase tracking-wide font-bold text-warning-700 bg-warning-50 border border-warning-200 rounded-md px-2 py-1">
            Düzenleme · V2
          </span>
        </div>

        <dl className="space-y-4">
          <Row label="Firma Adı" value={tenant.name} />
          <Row label="Vergi Numarası" value={tenant.taxNumber || "—"} mono />
          <Row label="Vergi Dairesi" value={tenant.taxOffice || "—"} />
          <Row label="Sektör" value={tenant.industry || "—"} />
          <Row label="İl" value={tenant.city || "—"} />
          <Row label="İlçe" value={tenant.district || "—"} />
          <Row label="Adres" value={tenant.addressLine || "—"} />
          {tenant.postalCode ? (
            <Row label="Posta Kodu" value={tenant.postalCode} />
          ) : null}
        </dl>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <p className="text-xs text-slate-500 leading-relaxed">
            Firma bilgilerinizi değiştirmek için lütfen Supkeys destek ekibi
            ile iletişime geçin:{" "}
            <a
              href="mailto:destek@supkeys.com"
              className="text-brand-600 hover:underline"
            >
              destek@supkeys.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "text-sm text-brand-900 mt-1 font-mono"
            : "text-sm text-brand-900 mt-1 font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}
