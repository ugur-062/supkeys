"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CompanyDetailView } from "./_components/company-detail-view";

function DetailWithTab() {
  const params = useParams<{ id: string }>();
  // ?tab=belgeler → doğrudan ilgili sekmede açılır (Başvurular kuyruğundan).
  const search = useSearchParams();
  if (!params?.id) return null;
  return (
    <CompanyDetailView
      companyId={params.id}
      initialTab={search.get("tab") ?? undefined}
    />
  );
}

export default function AdminCompanyDetailPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <DetailWithTab />
      </Suspense>
    </AdminShell>
  );
}
