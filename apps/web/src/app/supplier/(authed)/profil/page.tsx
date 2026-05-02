import type { Metadata } from "next";
import { CompanyInfoCard } from "./_components/company-info-card";
import { TenantRelationsList } from "./_components/tenant-relations-list";

export const metadata: Metadata = {
  title: "Profilim",
};

export default function SupplierProfilePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-display font-bold text-brand-900">
          Profilim
        </h1>
        <p className="text-slate-500">
          Firma bilgilerinizi ve bağlı olduğunuz alıcıları yönetin.
        </p>
      </div>
      <CompanyInfoCard />
      <TenantRelationsList />
    </div>
  );
}
