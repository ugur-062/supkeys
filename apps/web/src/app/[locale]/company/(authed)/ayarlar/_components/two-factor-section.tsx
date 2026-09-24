"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useDisable2fa,
  useEnable2fa,
  useEnableEmail2fa,
  useSendEmail2faCode,
  useSetup2fa,
} from "@/hooks/use-company-account";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useState } from "react";
import { toast } from "sonner";

export function TwoFactorSection() {
  const t = useTranslations("web.panel.settings.twoFactorSection");
  const { user } = useCompanyAuth();
  const setup = useSetup2fa();
  const enable = useEnable2fa();
  const disable = useDisable2fa();
  const sendEmailCode = useSendEmail2faCode();
  const enableEmail = useEnableEmail2fa();

  const enabled = !!user?.twoFactorEnabled;
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disableMode, setDisableMode] = useState(false);
  // E-posta 2FA kurulumu sürüyor (kod gönderildi, giriş bekleniyor).
  const [emailMode, setEmailMode] = useState(false);

  const startEmailSetup = async () => {
    try {
      await sendEmailCode.mutateAsync();
      setEmailMode(true);
      toast.success(t("ePostanizaDogrulamaKoduGonderildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kodGonderilemedi")));
    }
  };

  const sendDisableEmailCode = async () => {
    try {
      await sendEmailCode.mutateAsync();
      toast.success(t("ePostanizaDogrulamaKoduGonderildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kodGonderilemedi")));
    }
  };

  const confirmEnableEmail = async () => {
    try {
      const res = await enableEmail.mutateAsync(code.trim());
      toast.success(t("ePostaIleIkiAdimli"));
      setEmailMode(false);
      setCode("");
      setRecoveryCodes(res.recoveryCodes ?? null);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kodDogrulanamadi")));
    }
  };
  // Kurtarma kodları YALNIZCA enable yanıtında görünür — kullanıcı
  // kaydettim diyene kadar ekranda tutulur.
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const startSetup = async () => {
    try {
      const res = await setup.mutateAsync();
      setQr(res.qrDataUrl);
      setSecret(res.secret);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kurulumBaslatilamadi")));
    }
  };

  const confirmEnable = async () => {
    try {
      const res = await enable.mutateAsync(code.trim());
      toast.success(t("ikiAdimliDogrulamaAcildi"));
      setQr(null);
      setSecret(null);
      setCode("");
      setRecoveryCodes(res.recoveryCodes ?? null);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kodDogrulanamadi")));
    }
  };

  const copyRecovery = async () => {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast.success(t("kurtarmaKodlariPanoyaKopyalandi"));
  };

  const downloadRecovery = () => {
    if (!recoveryCodes) return;
    const blob = new Blob(
      [
        `${t("kurtarmaDosyasiBaslik", { email: user?.email ?? "" })}\n${t("kurtarmaDosyasiNot")}\n\n${recoveryCodes.join("\n")}\n`,
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rothern-2fa-kurtarma-kodlari.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmDisable = async () => {
    try {
      await disable.mutateAsync(code.trim());
      toast.success(t("ikiAdimliDogrulamaKapatildi"));
      setDisableMode(false);
      setCode("");
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kapatilamadi")));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      {/* Başlık SettingsShell'de — burada yalnız durum (2026-09-10). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text className="text-sm text-zinc-600">
          {t("authenticatorUygulamasiGoogleAuthenticatorAu")}
        </Text>
        <Badge color={enabled ? "green" : "zinc"}>
          {enabled ? t("acik") : t("kapali")}
        </Badge>
      </div>

      {/* Kapalı + kurulum başlatılmadı → yöntem seçimi */}
      {!enabled && !qr && !emailMode ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={startSetup} disabled={setup.isPending}>
            {t("authenticatorIleKur")}
          </Button>
          <Button
            outline
            onClick={startEmailSetup}
            disabled={sendEmailCode.isPending}
          >
            {sendEmailCode.isPending ? t("gonderiliyor") : t("ePostaIleKur")}
          </Button>
        </div>
      ) : null}

      {/* E-posta 2FA kurulumu: koda gir */}
      {!enabled && emailMode ? (
        <div className="mt-4 space-y-3">
          <Text className="text-sm text-zinc-600">
            {t.rich("adresine6HaneliKodGonderdik", {
              strong: (c) => <strong>{c}</strong>,
              email: user?.email ?? "",
            })}
          </Text>
          <Field>
            <Label>{t("dogrulamaKodu")}</Label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("n6HaneliKod")}
              className="max-w-[200px]"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmEnableEmail} disabled={enableEmail.isPending || code.length !== 6}>
              {t("dogrulaAc")}
            </Button>
            <Button
              plain
              onClick={startEmailSetup}
              disabled={sendEmailCode.isPending}
            >
              {t("koduYenidenGonder")}
            </Button>
            <Button
              plain
              onClick={() => {
                setEmailMode(false);
                setCode("");
              }}
            >
              {t("vazgec")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Kurulum: QR + kod doğrulama */}
      {!enabled && qr ? (
        <div className="mt-4 space-y-3">
          <Text className="text-sm text-zinc-600">
            {t("n1AuthenticatorUygulamanizlaAsagidakiQr")}
          </Text>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={t("n2faQrKodu")}
            className="h-44 w-44 rounded-lg border border-zinc-200"
          />
          {secret ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2">
              <p className="text-xs text-zinc-500">
                {t("qrOkutamiyorsanizBuAnahtariUygulamaya")}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="tabular-nums text-sm tracking-wider text-zinc-900">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(secret);
                    toast.success(t("anahtarKopyalandi"));
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  {t("kopyala")}
                </button>
              </div>
            </div>
          ) : null}
          <Field>
            <Label>{t("dogrulamaKodu")}</Label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("n6HaneliKod")}
              className="max-w-[200px]"
            />
          </Field>
          <div className="flex gap-2">
            <Button onClick={confirmEnable} disabled={enable.isPending || code.length !== 6}>
              {t("dogrulaAc")}
            </Button>
            <Button
              plain
              onClick={() => {
                // Kurulumdan vazgeçince kod ve sır da sıfırlanır — yeniden
                // başlatınca eski kod dolu gelmesin.
                setQr(null);
                setSecret(null);
                setCode("");
              }}
            >
              {t("vazgec")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Enable sonrası: kurtarma kodları — BİR KEZ gösterilir */}
      {recoveryCodes ? (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {t("kurtarmaKodlarinizSimdiKaydedinBir")}
          </p>
          <p className="text-xs text-amber-800">
            {t("authenticatorCihaziniziKaybedersenizBuKodlar")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recoveryCodes.map((c) => (
              <code
                key={c}
                className="rounded bg-white px-2 py-1 text-center tabular-nums text-sm text-zinc-900"
              >
                {c}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button outline onClick={copyRecovery}>
              {t("kopyala")}
            </Button>
            <Button outline onClick={downloadRecovery}>
              {t("txtIndir")}
            </Button>
            <Button onClick={() => setRecoveryCodes(null)}>
              {t("kodlariKaydettim")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Açık → kapatma */}
      {enabled && !recoveryCodes ? (
        <div className="mt-4">
          {!disableMode ? (
            <Button outline onClick={() => setDisableMode(true)}>
              {t("n2faYiKapat")}
            </Button>
          ) : (
            <div className="space-y-3">
              <Field>
                <Label>{t("dogrulamaKoduVeyaKurtarmaKodu")}</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("n6HaneliKodYaDa")}
                  className="max-w-[240px]"
                />
              </Field>
              <Text className="text-xs text-zinc-500">
                {t("authenticatorKullaniyorsanizUygulamadakiKodu")}
              </Text>
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirmDisable} disabled={disable.isPending || !code.trim()}>
                  {t("kapat")}
                </Button>
                <Button
                  plain
                  onClick={sendDisableEmailCode}
                  disabled={sendEmailCode.isPending}
                >
                  {t("ePostayaKodGonder")}
                </Button>
                <Button plain onClick={() => setDisableMode(false)}>
                  {t("vazgec")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
