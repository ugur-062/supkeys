"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { useParams } from "next/navigation";
import { CompanyDetailView } from "./_components/company-detail-view";

export default function AdminCompanyDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <AdminShell>
      {params?.id ? <CompanyDetailView companyId={params.id} /> : null}
    </AdminShell>
  );
}
