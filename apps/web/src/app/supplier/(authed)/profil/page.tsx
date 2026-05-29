import { PageHeader } from "@/components/list";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoriesCard } from "./_components/categories-card";
import { CompanyInfoCard } from "./_components/company-info-card";
import { TenantRelationsList } from "./_components/tenant-relations-list";

export const metadata: Metadata = {
  title: "Profilim",
};

export default function SupplierProfilePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Profilim"
        description="Firma bilgilerinizi ve bağlı olduğunuz alıcıları yönetin."
      />
      <CompanyInfoCard />
      <CategoriesCard />
      {/* useSearchParams için Suspense sınırı (Next.js 15 gereksinimi) */}
      <Suspense fallback={null}>
        <TenantRelationsList />
      </Suspense>
    </div>
  );
}
