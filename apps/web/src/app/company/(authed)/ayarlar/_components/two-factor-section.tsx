"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
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
      toast.success("E-postanıza doğrulama kodu gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kod gönderilemedi"));
    }
  };

  const sendDisableEmailCode = async () => {
    try {
      await sendEmailCode.mutateAsync();
      toast.success("E-postanıza doğrulama kodu gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kod gönderilemedi"));
    }
  };

  const confirmEnableEmail = async () => {
    try {
      const res = await enableEmail.mutateAsync(code.trim());
      toast.success("E-posta ile iki adımlı doğrulama açıldı");
      setEmailMode(false);
      setCode("");
      setRecoveryCodes(res.recoveryCodes ?? null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kod doğrulanamadı"));
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
      toast.error(extractErrorMessage(err, "Kurulum başlatılamadı"));
    }
  };

  const confirmEnable = async () => {
    try {
      const res = await enable.mutateAsync(code.trim());
      toast.success("İki adımlı doğrulama açıldı");
      setQr(null);
      setSecret(null);
      setCode("");
      setRecoveryCodes(res.recoveryCodes ?? null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kod doğrulanamadı"));
    }
  };

  const copyRecovery = async () => {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast.success("Kurtarma kodları panoya kopyalandı");
  };

  const downloadRecovery = () => {
    if (!recoveryCodes) return;
    const blob = new Blob(
      [
        `Rothern 2FA kurtarma kodları (${user?.email ?? ""})\nHer kod TEK kullanımlıktır — güvenli bir yerde saklayın.\n\n${recoveryCodes.join("\n")}\n`,
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
      toast.success("İki adımlı doğrulama kapatıldı");
      setDisableMode(false);
      setCode("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kapatılamadı"));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <Subheading>İki Adımlı Doğrulama (2FA)</Subheading>
          <Text className="mt-0.5 text-sm text-zinc-500">
            Authenticator uygulaması (Google Authenticator, Authy…) veya
            e-postanıza gelen kod ile ekstra güvenlik.
          </Text>
        </div>
        <Badge color={enabled ? "green" : "zinc"}>
          {enabled ? "Açık" : "Kapalı"}
        </Badge>
      </div>

      {/* Kapalı + kurulum başlatılmadı → yöntem seçimi */}
      {!enabled && !qr && !emailMode ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={startSetup} disabled={setup.isPending}>
            Authenticator ile Kur
          </Button>
          <Button
            outline
            onClick={startEmailSetup}
            disabled={sendEmailCode.isPending}
          >
            {sendEmailCode.isPending ? "Gönderiliyor…" : "E-posta ile Kur"}
          </Button>
        </div>
      ) : null}

      {/* E-posta 2FA kurulumu: koda gir */}
      {!enabled && emailMode ? (
        <div className="mt-4 space-y-3">
          <Text className="text-sm text-zinc-600">
            <strong>{user?.email}</strong> adresine 6 haneli bir kod gönderdik.
            Girip onaylayın — bundan sonra her girişte e-postanıza kod gelir.
          </Text>
          <Field>
            <Label>Doğrulama kodu</Label>
            <Input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 haneli kod"
              className="max-w-[200px]"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmEnableEmail} disabled={enableEmail.isPending}>
              Doğrula & Aç
            </Button>
            <Button
              plain
              onClick={startEmailSetup}
              disabled={sendEmailCode.isPending}
            >
              Kodu yeniden gönder
            </Button>
            <Button
              plain
              onClick={() => {
                setEmailMode(false);
                setCode("");
              }}
            >
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}

      {/* Kurulum: QR + kod doğrulama */}
      {!enabled && qr ? (
        <div className="mt-4 space-y-3">
          <Text className="text-sm text-zinc-600">
            1) Authenticator uygulamanızla aşağıdaki QR kodu okutun. 2) Üretilen
            6 haneli kodu girip onaylayın.
          </Text>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="2FA QR kodu"
            className="h-44 w-44 rounded-lg border border-zinc-200"
          />
          {secret ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="text-xs text-zinc-500">
                QR okutamıyorsanız bu anahtarı uygulamaya elle girin:
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="font-mono text-sm tracking-wider text-zinc-900">
                  {secret}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(secret);
                    toast.success("Anahtar kopyalandı");
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Kopyala
                </button>
              </div>
            </div>
          ) : null}
          <Field>
            <Label>Doğrulama kodu</Label>
            <Input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 haneli kod"
              className="max-w-[200px]"
            />
          </Field>
          <div className="flex gap-2">
            <Button onClick={confirmEnable} disabled={enable.isPending}>
              Doğrula & Aç
            </Button>
            <Button plain onClick={() => setQr(null)}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}

      {/* Enable sonrası: kurtarma kodları — BİR KEZ gösterilir */}
      {recoveryCodes ? (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Kurtarma kodlarınız — şimdi kaydedin, bir daha gösterilmez!
          </p>
          <p className="text-xs text-amber-800">
            Authenticator cihazınızı kaybederseniz bu kodlardan biriyle giriş
            yapabilirsiniz. Her kod tek kullanımlıktır.
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {recoveryCodes.map((c) => (
              <code
                key={c}
                className="rounded bg-white px-2 py-1 text-center font-mono text-sm text-zinc-900"
              >
                {c}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button outline onClick={copyRecovery}>
              Kopyala
            </Button>
            <Button outline onClick={downloadRecovery}>
              .txt İndir
            </Button>
            <Button onClick={() => setRecoveryCodes(null)}>
              Kodları kaydettim
            </Button>
          </div>
        </div>
      ) : null}

      {/* Açık → kapatma */}
      {enabled && !recoveryCodes ? (
        <div className="mt-4">
          {!disableMode ? (
            <Button outline onClick={() => setDisableMode(true)}>
              2FA'yı Kapat
            </Button>
          ) : (
            <div className="space-y-3">
              <Field>
                <Label>Doğrulama kodu veya kurtarma kodu</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6 haneli kod ya da XXXX-XXXX"
                  className="max-w-[240px]"
                />
              </Field>
              <Text className="text-xs text-zinc-400">
                Authenticator kullanıyorsanız uygulamadaki kodu; e-posta 2FA
                kullanıyorsanız “E-postaya kod gönder” ile gelen kodu girin.
              </Text>
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirmDisable} disabled={disable.isPending}>
                  Kapat
                </Button>
                <Button
                  plain
                  onClick={sendDisableEmailCode}
                  disabled={sendEmailCode.isPending}
                >
                  E-postaya kod gönder
                </Button>
                <Button plain onClick={() => setDisableMode(false)}>
                  Vazgeç
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
