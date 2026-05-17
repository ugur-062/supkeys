"use client";

import { Button } from "@/components/ui/button";
import { useApprovalFlow } from "@/hooks/use-approval-flows";
import { usePermissions } from "@/hooks/use-permissions";
import { AlertCircle, ChevronLeft, Loader2, Shield } from "lucide-react";
import Link from "next/link";
import { ApprovalFlowDetailView } from "./approval-flow-detail-view";

export function ApprovalFlowDetailLoader({ id }: { id: string }) {
  // V2-6.5 RBAC — settings:approval permission'a göre
  const { has } = usePermissions();
  const isAdmin = has("settings:approval");
  const flowQuery = useApprovalFlow(id);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link
          href="/dashboard/ayarlar"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Ayarlar
        </Link>
        <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 p-6 flex gap-3 items-start">
          <Shield className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-warning-800">
            Bu sayfa yalnızca <strong>Yönetici</strong> rolündeki
            kullanıcılara açıktır.
          </p>
        </div>
      </div>
    );
  }

  if (flowQuery.isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Akış yükleniyor…
      </div>
    );
  }

  if (flowQuery.isError || !flowQuery.data) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Link
          href="/dashboard/ayarlar/onay-akislari"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Onay Akışları
        </Link>
        <div className="mt-4 rounded-2xl border border-danger-200 bg-danger-50 p-6 flex gap-3 items-start">
          <AlertCircle className="h-5 w-5 text-danger-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-danger-800">Akış bulunamadı</p>
            <p className="text-sm text-danger-700 mt-1">
              Bu akış silinmiş, ait olduğunuz tenant'a ait değil veya hatalı bir
              link kullanıyorsunuz.
            </p>
            <Link
              href="/dashboard/ayarlar/onay-akislari"
              className="inline-block mt-3"
            >
              <Button variant="secondary" size="sm">
                Akış Listesine Dön
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <ApprovalFlowDetailView flow={flowQuery.data} />;
}
