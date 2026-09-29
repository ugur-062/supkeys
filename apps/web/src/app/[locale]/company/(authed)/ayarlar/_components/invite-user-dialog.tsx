"use client";

import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, pickLocale, type Locale } from "@rothern/i18n";
import { Button } from "@/components/catalyst/button";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Description, ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { PermissionTable } from "@/components/company/permission-table";
import { defaultInvitePermissions } from "@/components/company/permission-presets";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useInviteUser,
  usePermissionCatalog,
  useSeats,
} from "@/hooks/use-company-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useInviteDeliveryToast } from "./use-invite-delivery-toast";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Token'lı davet — e-posta + YETKİ TABLOSU (Faz 4): davetli hangi tiklerle
 * katılacaksa burada işaretlenir; hazır set çipleri (varsayılan pakete göre)
 * tabloyu doldurur. Davetli, e-postadaki linkten adını/şifresini KENDİSİ
 * belirleyip sözleşmeleri onaylayarak katılır.
 *
 * DAVET DİLİ (2026-09-27): e-posta ve kabul sayfası seçilen dilde açılır
 * (varsayılan: şu anki arayüz dili). Davetli kabul sayfasında dili yine
 * değiştirebilir; hesap kabul ettiği sayfanın dilinde doğar.
 */
export function InviteUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("web.panel.settings.inviteUserDialog");
  const invite = useInviteUser();
  const reportDelivery = useInviteDeliveryToast();
  const { user: viewer } = useCompanyAuth();
  const { data: catalog } = usePermissionCatalog();
  // Faz K: koltuk doluysa işlem tikleri kilitli (UX — asıl kapı backend).
  const { data: seats } = useSeats();
  const freeSeats =
    seats?.limit == null
      ? null
      : Math.max(0, seats.limit - seats.used - seats.pendingSeatInvites);
  // Satınalma yetkisi yalnız GOLD'da verilebilir — talep açma/kazandırma
  // ücretsiz pakette kapalı. Backend `assertSeatAvailable` aynı kuralı
  // uyguluyor; buradaki yalnız aynası (kullanıcı kilidin sebebini görsün).
  const canGrantBuy = tierAtLeast(seats?.tier ?? "STANDART", BUYING_TIER);
  const seatsFull = freeSeats === 0;
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  // Gerçek e-posta biçimi (eskiden yalnız "@" içeriyor mu diye bakılıyordu).
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const [perms, setPerms] = useState<string[]>([]);
  const uiLocale = pickLocale(useLocale()) ?? DEFAULT_LOCALE;
  const [inviteLocale, setInviteLocale] = useState<Locale>(uiLocale);
  // Varsayılan hazır set PAKETE ve KOLTUĞA göre (derin denetim MU-13):
  // Gold'da Satın Almacı, değilse Satışçı, koltuk doluysa Görüntüleyici.
  // Koşulsuz Satın Almacı, ücretsiz/Silver firmanın "yalnız e-postayı yaz,
  // gönder" davetini satınalma paket kapısında 400'e düşürüyordu. Koltuk
  // bilgisi gelmeden varsayılan uygulanmaz (paket bilinmeden seçilemez).
  const defaultPerms = () =>
    catalog && seats ? defaultInvitePermissions(catalog, { canGrantBuy, freeSeats }) : [];
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !catalog || !seats) return;
    defaulted.current = true;
    if (perms.length === 0) setPerms(defaultPerms());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, seats]);

  const canSave = emailValid && perms.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      const res = await invite.mutateAsync({
        email: email.trim(),
        permissions: perms,
        locale: inviteLocale,
      });
      // E-posta gerçekten gitti mi? Gitmediyse uyarı + yeniden gönder.
      reportDelivery(res, {
        id: res.id,
        email: res.email,
        successMessage: t("davetEPostasiGonderildi7"),
      });
      setEmail("");
      setPerms(defaultPerms());
      setInviteLocale(uiLocale);
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("davetGonderilemedi")));
    }
  };

  return (
    <Dialog open={open} onClose={() => !invite.isPending && onClose()} size="2xl">
      <DialogTitle>{t("uyeDavetEt")}</DialogTitle>
      <DialogDescription>
        {t("davetliEPostasindakiLinktenAdini")}
      </DialogDescription>
      <DialogBody className="-mr-3 max-h-[70vh] space-y-4 overflow-y-auto pr-3">
        <Field>
          <Label>{t("ePosta")}</Label>
          <Input
            type="email"
            autoFocus
            value={email}
            invalid={emailTouched && !!email && !emailValid}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            placeholder={t("kisiFirmaCom")}
          />
          {emailTouched && email && !emailValid ? (
            <ErrorMessage>{t("gecerliBirEPostaAdresi")}</ErrorMessage>
          ) : null}
        </Field>
        <Field className="max-w-xs">
          <Label>{t("davetDili")}</Label>
          <Description>{t("davetDiliIpucu")}</Description>
          <Select
            name="inviteLocale"
            value={inviteLocale}
            onChange={(e) => setInviteLocale(e.target.value as Locale)}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code} lang={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-zinc-900">{t("yetkiler")}</p>
            {seatsFull ? (
              <p className="text-xs text-amber-700">
                {t("kullaniciHakkiDoluIslemTikleri")}
              </p>
            ) : null}
          </div>
          <div className="mt-2">
            {catalog ? (
              <PermissionTable
                catalog={catalog}
                value={perms}
                onChange={setPerms}
                viewerIsOwner={!!viewer?.isOwner}
                freeSeats={freeSeats}
                canGrantBuy={canGrantBuy}
              />
            ) : (
              <p className="text-sm text-zinc-500">{t("yetkiKataloguYukleniyor")}</p>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={invite.isPending}>
          {t("vazgec")}
        </Button>
        <Button onClick={handleSave} disabled={!canSave || invite.isPending}>
          {invite.isPending ? t("gonderiliyor") : t("davetGonder")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
