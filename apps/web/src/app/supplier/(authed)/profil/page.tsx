import { Divider } from "@/components/catalyst/divider";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BanksCard } from "./_components/banks-card";
import { CategoriesCard } from "./_components/categories-card";
import { CertificatesCard } from "./_components/certificates-card";
import { CompanyInfoCard } from "./_components/company-info-card";
import { PublicProfileCard } from "./_components/public-profile-card";
import { TenantRelationsList } from "./_components/tenant-relations-list";

export const metadata: Metadata = {
  title: "Profilim",
};

export default function SupplierProfilePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Profilim</Heading>
      <Text className="mt-1">
        Firma bilgilerinizi ve bağlı olduğunuz alıcıları yönetin.
      </Text>

      <Divider className="my-8" />
      <PublicProfileCard />

      <Divider className="my-8" />
      <CompanyInfoCard />

      <Divider className="my-8" />
      <CategoriesCard />

      <Divider className="my-8" />
      <CertificatesCard />

      <Divider className="my-8" />
      <BanksCard />

      <Divider className="my-8" />
      {/* useSearchParams için Suspense sınırı (Next.js 15 gereksinimi) */}
      <Suspense fallback={null}>
        <TenantRelationsList />
      </Suspense>
    </div>
  );
}
