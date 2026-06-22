"use client";

import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDisable2fa,
  useEnable2faStart,
  useEnable2faVerify,
  useMe,
} from "@/hooks/use-auth";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Tenant2faPage() {
  const me = useMe();
  const start = useEnable2faStart();
  const verify = useEnable2faVerify();
  const disable = useDisable2fa();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const enabled = me.data?.twoFactorEnabled ?? false;

  const onStart = () =>
    start.mutate(undefined, {
      onSuccess: (d) => {
        setChallengeId(d.challengeId);
        toast.info("E-postanıza 6 haneli kod gönderildi");
      },
      onError: () => toast.error("Kod gönderilemedi"),
    });

  const onVerify = () => {
    if (!challengeId || code.length !== 6) return;
    verify.mutate(
      { challengeId, code },
      {
        onSuccess: async () => {
          toast.success("2 adımlı doğrulama etkinleştirildi");
          setChallengeId(null);
          setCode("");
          await me.refetch();
        },
        onError: () => toast.error("Kod doğrulanamadı"),
      },
    );
  };

  const onDisable = () =>
    disable.mutate(undefined, {
      onSuccess: async () => {
        toast.success("2 adımlı doğrulama kapatıldı");
        await me.refetch();
      },
      onError: () => toast.error("İşlem başarısız"),
    });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <PageHeader
        title="2 Adımlı Doğrulama"
        description="Girişte e-posta tabanlı tek kullanımlık kod ile ek güvenlik."
      />

      {me.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-6">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                enabled
                  ? "bg-success-100 text-success-700"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-zinc-900">
                Durum: {enabled ? "Aktif" : "Kapalı"}
              </p>
              <p className="text-sm text-zinc-500">
                {enabled
                  ? "Her girişte e-postanıza gönderilen kodu girmeniz istenir."
                  : "Etkinleştirdiğinizde girişlerde ek bir doğrulama adımı eklenir."}
              </p>
            </div>
          </div>

          <div className="mt-5 border-t border-zinc-100 pt-5">
            {enabled ? (
              <Button
                variant="secondary"
                onClick={onDisable}
                loading={disable.isPending}
              >
                Devre Dışı Bırak
              </Button>
            ) : challengeId ? (
              <div className="space-y-4">
                <Field>
                  <Label htmlFor="enable-otp" required>
                    E-postanıza gönderilen kod
                  </Label>
                  <Input
                    id="enable-otp"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                    }
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    onClick={onVerify}
                    loading={verify.isPending}
                    disabled={verify.isPending || code.length !== 6}
                  >
                    Doğrula ve Etkinleştir
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setChallengeId(null);
                      setCode("");
                    }}
                  >
                    Vazgeç
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={onStart} loading={start.isPending}>
                Etkinleştir
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
