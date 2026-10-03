"use client";

import { ConsentRows, type Consents } from "@/components/auth/consent-rows";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { useCompanyLogout } from "@/hooks/use-company-auth";
import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import type { CompanyMeResponse } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Sözleşme onayı kapısı (derin denetim 2026-09-29 MU-04). Onay izi olmayan
 * hesap (ör. destek ekibinin admin panelinden eklediği üye) panele girince
 * kullanıcı sözleşmesi, aracılık sözleşmesi ve KVKK aydınlatma onayını
 * KENDİSİ verir — kayıt ve davet kabulündeki satırların aynısı (`ConsentRows`).
 * Kapatılamaz; tek çıkış onay ya da oturumu kapatmak.
 */
export function TermsAcceptanceGate() {
  const needs = useCompanyAuthStore((s) => s.user?.needsTermsAcceptance === true);
  if (!needs) return null;
  return <TermsAcceptanceDialog />;
}

function TermsAcceptanceDialog() {
  const t = useTranslations("web.panel.termsGate");
  const setMe = useCompanyAuthStore((s) => s.setMe);
  const qc = useQueryClient();
  const logout = useCompanyLogout();
  const [consents, setConsents] = useState<Consents>({
    terms: false,
    mediation: false,
    kvkk: false,
    marketing: false,
    profile: false,
  });
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post<CompanyMeResponse>(
        "/company-auth/accept-terms",
        {
          termsAccepted: consents.terms,
          mediationAccepted: consents.mediation,
          kvkkAccepted: consents.kvkk,
          marketingConsent: consents.marketing,
          profileImprovementConsent: consents.profile,
        },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["company-auth", "me"], data);
      setMe(data);
    },
    onError: (err) => setError(extractErrorMessage(err, t("failed"))),
  });

  const valid = consents.terms && consents.mediation && consents.kvkk;

  return (
    <Dialog open onClose={() => undefined} size="lg">
      <DialogTitle>{t("title")}</DialogTitle>
      <DialogDescription>{t("description")}</DialogDescription>
      <DialogBody className="space-y-3">
        <ConsentRows consents={consents} onChange={setConsents} />
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={() => void logout()}>
          {t("logout")}
        </Button>
        <Button
          disabled={!valid || accept.isPending}
          onClick={() => {
            setError(null);
            accept.mutate();
          }}
        >
          {t("submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
