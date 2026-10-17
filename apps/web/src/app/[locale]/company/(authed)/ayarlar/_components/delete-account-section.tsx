"use client";

import { Button } from "@/components/catalyst/button";
import { DeleteAccountForm } from "@/components/company/delete-account-form";
import { Link } from "@/i18n/navigation";
import { OPERATOR } from "@/lib/company-info";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

const card = "rounded-xl border border-zinc-950/10 bg-white p-5";
const link = "text-zinc-950 underline hover:text-zinc-700";

/**
 * Hesabı sil — kişi KENDİ hesabını şifresiyle siler (iki uygulama mağazası da
 * uygulama içinden silme yolu ister). Kurallar sunucuda
 * (`AccountDeletionService`): başka kullanıcısı olan Kurucu önce devreder,
 * süren işi olan tek kullanıcılı firma kapanamaz — iki kural da kartta önceden
 * yazılı, sunucunun iletisi satır içinde; kuralı yerine getiremeyen için KVKK
 * adresi (Google Play: ek adım varsa destek yolu da verilmeli). Kart, neyin
 * silinip neyin saklandığını anlatan herkese açık `/hesap-silme` sayfasına ve
 * Gizlilik Politikası'na bağlanır (Apple 5.1.1: gizlilik bağlantısı uygulama
 * içinde kolay bulunur olmalı; metin neyin saklandığını söylemeli). Şifre formu
 * kurulum sihirbazı ve sözleşme onayı penceresiyle ortak
 * (`components/company/delete-account-form.tsx`).
 */
export function DeleteAccountSection() {
  const t = useTranslations("web.panel.settings.deleteAccountSection");
  const [open, setOpen] = useState(false);
  const to = (href: string) =>
    function LinkChunk(chunks: ReactNode) {
      return (
        <Link href={href} className={link}>
          {chunks}
        </Link>
      );
    };
  const mail = (chunks: ReactNode) => (
    <a href={`mailto:${OPERATOR.kvkkEmail}`} className={link}>
      {chunks}
    </a>
  );

  return (
    <section className={card}>
      <h2 className="text-base font-semibold text-zinc-950">{t("title")}</h2>
      <p className="mt-1 text-sm text-zinc-600">{t("body")}</p>
      <p className="mt-1 text-sm text-zinc-600">{t.rich("bodyFounder", { users: to("/company/ayarlar/kullanicilar") })}</p>
      <p className="mt-1 text-sm text-zinc-600">{t("bodyLastMember")}</p>
      <p className="mt-1 text-sm text-zinc-600">{t.rich("bodyHelp", { mail, email: OPERATOR.kvkkEmail })}</p>
      <p className="mt-2 text-sm text-zinc-600">
        {t.rich("details", { deletion: to("/hesap-silme"), privacy: to("/sozlesmeler/gizlilik") })}
      </p>

      {open ? (
        <DeleteAccountForm onCancel={() => setOpen(false)} />
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
