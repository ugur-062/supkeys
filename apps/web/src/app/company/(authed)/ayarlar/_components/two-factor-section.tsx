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

  const enabled = !!user?.twoFactorEnabled;
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disableMode, setDisableMode] = useState(false);

  const startSetup = async () => {
    try {
      const res = await setup.mutateAsync();
      setQr(res.qrDataUrl);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kurulum başlatılamadı"));
    }
  };

  const confirmEnable = async () => {
    try {
      await enable.mutateAsync(code.trim());
      toast.success("İki adımlı doğrulama açıldı");
      setQr(null);
      setCode("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kod doğrulanamadı"));
    }
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
            Authenticator uygulaması (Google Authenticator, Authy…) ile ekstra
            güvenlik.
          </Text>
        </div>
        <Badge color={enabled ? "green" : "zinc"}>
          {enabled ? "Açık" : "Kapalı"}
        </Badge>
      </div>

      {/* Kapalı + kurulum başlatılmadı */}
      {!enabled && !qr ? (
        <div className="mt-4">
          <Button onClick={startSetup} disabled={setup.isPending}>
            2FA Kur
          </Button>
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

      {/* Açık → kapatma */}
      {enabled ? (
        <div className="mt-4">
          {!disableMode ? (
            <Button outline onClick={() => setDisableMode(true)}>
              2FA'yı Kapat
            </Button>
          ) : (
            <div className="space-y-3">
              <Field>
                <Label>Mevcut authenticator kodu</Label>
                <Input
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6 haneli kod"
                  className="max-w-[200px]"
                />
              </Field>
              <div className="flex gap-2">
                <Button onClick={confirmDisable} disabled={disable.isPending}>
                  Kapat
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
