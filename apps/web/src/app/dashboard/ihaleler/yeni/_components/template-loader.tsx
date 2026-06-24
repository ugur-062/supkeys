"use client";

// Madde 34 — "Şablondan başla" akışı.
// Kayıtlı ihale şablonunu fetch eder, form değerlerine map edip wizard'ı
// create mode'da başlatır. data zaten TenderFormData blob'u (wizard'dan
// kaydedildi); tarihler + davetli tedarikçiler defansif olarak sıfırlanır.

import { Button } from "@/components/ui/button";
import { useTenderTemplate } from "@/hooks/use-templates";
import {
  DEFAULT_FORM_VALUES,
  type TenderFormData,
} from "@/lib/tenders/form-schema";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { TenderWizard } from "./tender-wizard";

export function TemplateLoader({ templateId }: { templateId: string }) {
  const tpl = useTenderTemplate(templateId);

  const templateData = useMemo<TenderFormData | null>(() => {
    if (!tpl.data) return null;
    return {
      ...DEFAULT_FORM_VALUES,
      ...(tpl.data.data as Partial<TenderFormData>),
      // Instance'a özgü alanları sıfırla — kullanıcı kendisi girer.
      bidsCloseAt: "",
      bidsOpenAt: "",
      invitedSupplierIds: [],
    };
  }, [tpl.data]);

  if (tpl.isLoading && !tpl.data) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">Şablon yükleniyor…</p>
      </div>
    );
  }

  if (!tpl.data || !templateData) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">Şablon bulunamadı</p>
          <p className="text-sm text-slate-500">
            Kullanmak istediğiniz şablon silinmiş olabilir.
          </p>
          <Link href="/dashboard/sablonlar/ihale" className="inline-block">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Şablonlar
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-5xl mx-auto mb-4 p-3 rounded-xl border border-brand-200 bg-brand-50/60 flex items-center gap-3 text-sm">
        <span className="text-brand-700">
          <strong>{tpl.data.name}</strong> şablonundan başlıyorsunuz — kapanış
          tarihi ve diğer değerleri istediğiniz gibi düzenleyin.
        </span>
      </div>
      <TenderWizard mode="create" initialData={templateData} />
    </>
  );
}
