"use client";

import { PageHeader } from "@/components/list";
import { CompanyDocsSection } from "@/components/onboarding/company-docs-section";
import {
  CorporateIdentityForm,
  type CorporateIdentityValues,
  type LockedItem,
} from "@/components/onboarding/corporate-identity-form";
import { useMe } from "@/hooks/use-auth";
import { useUpdateTenantCorporateIdentity } from "@/hooks/use-tenant-onboarding";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<string, string> = {
  JOINT_STOCK: "Anonim Şirket",
  LIMITED: "Limited Şirket",
  SOLE_PROPRIETOR: "Şahıs Şirketi",
};

export default function TenantCorporateIdentityPage() {
  const me = useMe();
  const update = useUpdateTenantCorporateIdentity();

  if (me.isLoading || !me.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const t = me.data.tenant;
  const lockedItems: LockedItem[] = [
    { label: "Firma Adı", value: t.name },
    { label: "Yasal Firma Ünvanı", value: t.legalName },
    {
      label: "Firma Türü",
      value: t.companyType ? (TYPE_LABEL[t.companyType] ?? t.companyType) : null,
    },
    { label: "Vergi Numarası", value: t.taxNumber },
    { label: "Vergi Dairesi", value: t.taxOffice },
    { label: "Yetkili T.C. Kimlik No", value: t.authorizedTckn },
    { label: "Yetkili Ünvanı", value: t.authorizedTitle },
    { label: "Fatura E-postası", value: t.billingEmail },
  ];
  const initial: CorporateIdentityValues = {
    mersisNo: t.mersisNo ?? "",
    tradeRegistryNo: t.tradeRegistryNo ?? "",
    kepAddress: t.kepAddress ?? "",
    iban: t.iban ?? "",
    ibanHolder: t.ibanHolder ?? "",
  };

  const onSave = (values: CorporateIdentityValues) => {
    update.mutate(values, {
      onSuccess: async () => {
        toast.success("Kurumsal kimlik bilgileri kaydedildi");
        await me.refetch();
      },
      onError: () => toast.error("Kaydedilemedi, lütfen tekrar deneyin"),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Kurumsal Kimlik"
        description="Firma doğrulama bilgilerinizi görüntüleyin ve tamamlayın."
      />
      <CorporateIdentityForm
        lockedItems={lockedItems}
        verificationStatus={t.companyVerificationStatus}
        initial={initial}
        saving={update.isPending}
        onSave={onSave}
      />
      <CompanyDocsSection surface="tenant" />
    </div>
  );
}
