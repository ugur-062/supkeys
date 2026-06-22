"use client";

import { PageHeader } from "@/components/list";
import { CompanyDocsSection } from "@/components/onboarding/company-docs-section";
import {
  CorporateIdentityForm,
  type CorporateIdentityValues,
  type LockedItem,
} from "@/components/onboarding/corporate-identity-form";
import { useSupplierMe } from "@/hooks/use-supplier-auth";
import { useUpdateSupplierCorporateIdentity } from "@/hooks/use-supplier-onboarding";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<string, string> = {
  JOINT_STOCK: "Anonim Şirket",
  LIMITED: "Limited Şirket",
  SOLE_PROPRIETOR: "Şahıs Şirketi",
};

export default function SupplierCorporateIdentityPage() {
  const me = useSupplierMe();
  const update = useUpdateSupplierCorporateIdentity();

  if (me.isLoading || !me.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const s = me.data.supplier;
  const lockedItems: LockedItem[] = [
    { label: "Firma Adı", value: s.companyName },
    { label: "Yasal Firma Ünvanı", value: s.legalName },
    { label: "Firma Türü", value: TYPE_LABEL[s.companyType] ?? s.companyType },
    { label: "Vergi Numarası", value: s.taxNumber },
    { label: "Vergi Dairesi", value: s.taxOffice },
    { label: "Yetkili T.C. Kimlik No", value: s.authorizedTckn },
    { label: "Yetkili Ünvanı", value: s.authorizedTitle },
    { label: "Fatura E-postası", value: s.billingEmail },
  ];
  const initial: CorporateIdentityValues = {
    mersisNo: s.mersisNo ?? "",
    tradeRegistryNo: s.tradeRegistryNo ?? "",
    kepAddress: s.kepAddress ?? "",
    iban: s.iban ?? "",
    ibanHolder: s.ibanHolder ?? "",
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
        verificationStatus={s.companyVerificationStatus}
        initial={initial}
        saving={update.isPending}
        onSave={onSave}
      />
      <CompanyDocsSection surface="supplier" />
    </div>
  );
}
