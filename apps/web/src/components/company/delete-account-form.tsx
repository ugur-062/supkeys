"use client";

import { Button } from "@/components/catalyst/button";
import { Dialog, DialogBody, DialogDescription, DialogTitle } from "@/components/catalyst/dialog";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { PasswordInput } from "@/components/ui/password-input";
import { useDeleteAccount } from "@/hooks/use-company-account";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { localizePath } from "@/i18n/href";
import { Link } from "@/i18n/navigation";
import { runtimeLocale } from "@/i18n/runtime";
import { rememberAccountDeleted } from "@/lib/company-auth/account-deleted-notice";
import { markCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { PASSWORD_MAX_LENGTH } from "@/lib/company-auth/password-rules";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { clearTenantSessionData } from "@/lib/company-auth/tenant-storage";
import { OPERATOR } from "@/lib/company-info";
import { clearPushToken } from "@/lib/native-push";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

/**
 * HESAP SİLME FORMU — TEK KAYNAK (2026-10-16, mağaza incelemesi).
 *
 * İki mağaza da hesabın uygulama İÇİNDEN silinebilmesini ister (Apple
 * 5.1.1(v), Google Play "hesap silme"). İnceleyici çoğu zaman yeni hesap açıp
 * silmeyi arar; şirket kurulumunu bitirmeyen kişi `/company/*` sayfalarına
 * (Ayarlar dahil) giremez, sözleşme onayı penceresi de kapatılamaz. Bu yüzden
 * şifre formu üç yerde aynıdır:
 *  - Ayarlar › Hesap Bilgileri (`DeleteAccountSection`, kart içinde açılır);
 *  - şirket kurulum sihirbazının üst çubuğu ve "Kurucu tamamlamalı" ekranı
 *    (`DeleteAccountDialog`);
 *  - sözleşme onayı kapısı (`TermsAcceptanceGate`, pencerenin içeriği değişir).
 * API `POST company-auth/delete-account` kurulum ve onay beklemez (yalnız
 * oturum). Metinler `web.auth.deleteAccount`ta: kurulum sayfası panel
 * sağlayıcısının DIŞINDA, `web.panel` orada yüklenmez.
 *
 * Başarıda oturum çıkıştaki sırayla temizlenir (nöbetçi `?next=` eklemez,
 * taslaklar ve mobil bildirim belirteci gider) ve giriş sayfası açılır. Onay
 * tam sayfa yüklemesini aşar: giriş sayfası "Hesabınız silindi" kutusunu
 * çizer (`account-deleted-notice.ts`; bildirim yüklemede kaybolurdu).
 *
 * `context="setup"` (kurulum sihirbazı, "Kurucu tamamlamalı", sözleşme onayı
 * penceresi): Kullanıcı Yönetimi oradan açılmaz → Kurucu devri reddi
 * (`ACCOUNT_OWNER_MUST_TRANSFER`) "Kullanıcı Yönetimi'nde devredin" yerine
 * destek adresini söyler (Google Play: ek adım varsa destek yolu).
 */
export function DeleteAccountForm({
  onCancel,
  onBeforeLeave,
  context = "settings",
}: {
  onCancel: () => void;
  /** Başarıda, oturum temizlenmeden hemen önce (ör. sihirbaz taslağını yazmayı durdurur). */
  onBeforeLeave?: () => void;
  /** Formun açıldığı yer; "setup" = panele girilemeyen ekranlar. */
  context?: "settings" | "setup";
}) {
  const t = useTranslations("web.auth.deleteAccount");
  const deleteAccount = useDeleteAccount();
  const clear = useCompanyAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lock = useSubmitLock();

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
        setError(
          context === "setup" && errorCode(err) === "ACCOUNT_OWNER_MUST_TRANSFER"
            ? t("ownerMustTransferSetup", { email: OPERATOR.kvkkEmail })
            : extractErrorMessage(err, t("failed")),
        );
        return;
      }
      onBeforeLeave?.();
      // Nöbetçi `?next=` eklemesin; istemci durumu çıkıştaki sırayla temizlenir.
      markCompanyLoggingOut();
      toast.success(t("done"));
      clear();
      queryClient.clear();
      clearTenantSessionData();
      // Mobil kabuk: cihaz kayıtları sunucuda hesapla birlikte silindi; yerel belirteç de gider.
      clearPushToken();
      // Oturum temizliğinden SONRA: giriş sayfası onayı bir kez gösterir.
      rememberAccountDeleted();
      window.location.href = localizePath("/company/login", runtimeLocale());
    });

  return (
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
      {/* Telefonda iki düğme tam genişlik, alt alta, silme üstte (pencere
          eylemleriyle aynı düzen); yan yana sığmayınca "Vazgeç" tek başına
          kalıp silme düğmesi alta kırılıyordu (mobil denetim 2026-10 g11). */}
      <div className="flex flex-col-reverse gap-3 *:w-full sm:flex-row sm:flex-wrap sm:justify-end sm:*:w-auto">
        <Button type="button" plain onClick={onCancel} disabled={lock.locked}>
          {t("cancel")}
        </Button>
        <Button type="submit" color="red" disabled={lock.locked || deleteAccount.isPending}>
          {t("confirm")}
        </Button>
      </div>
    </form>
  );
}

const DETAILS_LINK = "text-zinc-950 underline hover:text-zinc-700";

function errorCode(err: unknown): string | null {
  if (!isAxiosError(err)) return null;
  const code = (err.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : null;
}

/**
 * Silmenin koşulları ve destek yolu — panele girilemeyen ekranlarda (kurulum,
 * "Kurucu tamamlamalı", sözleşme onayı penceresi) pencerenin gövdesinde.
 * Ayarlar kartı aynı kuralları kendi metniyle yazar
 * (`deleteAccountSection.bodyFounder/bodyLastMember/bodyHelp`).
 */
export function DeleteAccountRules() {
  const t = useTranslations("web.auth.deleteAccount");
  const mail = (chunks: ReactNode) => (
    <a href={`mailto:${OPERATOR.kvkkEmail}`} className={DETAILS_LINK}>
      {chunks}
    </a>
  );
  return (
    <div className="space-y-2 text-sm text-zinc-600">
      <p>{t("bodyRules")}</p>
      <p>{t.rich("bodyHelp", { mail, email: OPERATOR.kvkkEmail })}</p>
    </div>
  );
}

/**
 * "Neyin silinip neyin saklandığı" satırı. Yarım akışın (kurulum, onay
 * penceresi) üstünde okunur: yeni sekme + `data-shell-browser` (kabukta
 * uygulama içi tarayıcı; WebView'de açılsa akış kaybolurdu).
 */
export function DeleteAccountDetails({ className }: { className?: string }) {
  const t = useTranslations("web.auth.deleteAccount");
  const to = (href: string) =>
    function LinkChunk(chunks: ReactNode) {
      return (
        <Link href={href} target="_blank" rel="noopener noreferrer" data-shell-browser="" className={DETAILS_LINK}>
          {chunks}
        </Link>
      );
    };
  return (
    <p className={className ?? "text-sm text-zinc-600"}>
      {t.rich("details", { deletion: to("/hesap-silme"), privacy: to("/sozlesmeler/gizlilik") })}
    </p>
  );
}

/** Kurulum sihirbazı ve "Kurucu tamamlamalı" ekranı için pencere. */
export function DeleteAccountDialog({
  open,
  onClose,
  onBeforeLeave,
}: {
  open: boolean;
  onClose: () => void;
  onBeforeLeave?: () => void;
}) {
  const t = useTranslations("web.auth.deleteAccount");
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>{t("title")}</DialogTitle>
      <DialogDescription>{t("body")}</DialogDescription>
      <DialogBody>
        <DeleteAccountRules />
        <DeleteAccountDetails className="mt-2 text-sm text-zinc-600" />
        {open ? <DeleteAccountForm onCancel={onClose} onBeforeLeave={onBeforeLeave} context="setup" /> : null}
      </DialogBody>
    </Dialog>
  );
}
