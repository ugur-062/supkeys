"use client";

import { Button } from "@/components/ui/button";
import { useApprovalRequest } from "@/hooks/use-approval-requests";
import { ChevronLeft, ClipboardX } from "lucide-react";
import Link from "next/link";
import { OnayDetayView } from "./onay-detay-view";

export function OnayDetayLoader({ id }: { id: string }) {
  const { data: request, isLoading, isError } = useApprovalRequest(id);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-center text-slate-500">
        Yükleniyor…
      </div>
    );
  }

  if (isError || !request) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          href="/dashboard/onay-bekleyenler"
          className="text-sm text-slate-500 hover:text-brand-600 inline-flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Onay Süreçleri
        </Link>
        <div className="bg-slate-50 border border-surface-border rounded-2xl p-8 text-center">
          <div className="h-14 w-14 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <ClipboardX className="h-7 w-7 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-brand-900">
            Onay süreci bulunamadı
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            Bu kayıt silinmiş veya size erişim izni yok.
          </p>
          <div className="mt-5">
            <Link href="/dashboard/onay-bekleyenler">
              <Button variant="secondary">Listeye dön</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <OnayDetayView request={request} />;
}
