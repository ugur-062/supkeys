"use client";

import { Button } from "@/components/catalyst/button";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { PasswordInput } from "@/components/ui/password-input";
import { useDeleteAccount } from "@/hooks/use-company-account";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { localizePath } from "@/i18n/href";
import { runtimeLocale } from "@/i18n/runtime";
import { markCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { clearTenantSessionData } from "@/lib/company-auth/tenant-storage";
import { PASSWORD_MAX_LENGTH } from "@/lib/company-auth/password-rules";
import { clearPushToken } from "@/lib/native-push";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

const card = "rounded-xl border border-zinc-950/10 bg-white p-5";

/**
 * Hesabı sil — kişi KENDİ hesabını şifresiyle siler (iki uygulama mağazası da
 * uygulama içinden silme yolu ister). Kurallar sunucuda
 * (`AccountDeletionService`): başka kullanıcısı olan Kurucu önce devreder,
 * süren işi olan tek kullanıcılı firma kapanamaz — o iletiler satır içinde.
 * Başarıda oturum çıkıştaki gibi temizlenir.
 */
export function DeleteAccountSection() {
  const t = useTranslations("web.panel.settings.deleteAccountSection");
  const deleteAccount = useDeleteAccount();
  const clear = useCompanyAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lock = useSubmitLock();

  const close = () => {
    setOpen(false);
    setPassword("");
    setError(null);
  };

  const submit = () =>
    lock.run(async () => {
      if (!password) {
        setError(t("passwordRequired"));
        return;
      }
      setError(null);
      try {
        await deleteAccount.mutateAsync({ password });
      } catch (err) {
        setError(extractErrorMessage(err, t("failed")));
        return;
      }
      // Nöbetçi `?next=` eklemesin; istemci durumu çıkıştaki sırayla temizlenir.
      markCompanyLoggingOut();
      toast.success(t("done"));
      clear();
      queryClient.clear();
      clearTenantSessionData();
      // Mobil kabuk: cihaz kayıtları sunucuda hesapla birlikte silindi; yerel belirteç de gider.
      clearPushToken();
      window.location.href = localizePath("/company/login", runtimeLocale());
    });

  return (
    <section className={card}>
      <h2 className="text-base font-semibold text-zinc-950">{t("title")}</h2>
      <p className="mt-1 text-sm text-zinc-600">{t("body")}</p>
      <p className="mt-1 text-sm text-zinc-600">{t("bodyLastMember")}</p>

      {open ? (
        <form
          className="mt-4 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field>
            <Label>{t("passwordLabel")}</Label>
            <PasswordInput
              autoComplete="current-password"
              autoFocus
              value={password}
              maxLength={PASSWORD_MAX_LENGTH}
              invalid={!!error}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? <ErrorMessage>{error}</ErrorMessage> : null}
          </Field>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" plain onClick={close} disabled={lock.locked}>
              {t("cancel")}
            </Button>
            <Button type="submit" color="red" disabled={lock.locked || deleteAccount.isPending}>
              {t("confirm")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex justify-end">
          <Button type="button" outline onClick={() => setOpen(true)}>
            {t("open")}
          </Button>
        </div>
      )}
    </section>
  );
}
