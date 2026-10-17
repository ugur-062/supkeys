"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/catalyst/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  PasswordChangeRequiredNotice,
  TwoFactorSetupNotice,
} from "@/components/layout/two-factor-setup-notice";
import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import { useAdminMe } from "@/hooks/use-admin-auth";
import { useChangePassword, useTwoFactor } from "@/hooks/use-admin-staff";
import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";

function PasswordSection() {
  const change = useChangePassword();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const set = (k: string, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <section className="admin-card px-5 py-4">
      <h3 className="text-admin-text flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4" /> Şifre Değiştir
      </h3>
      <div className="mt-3 grid max-w-lg grid-cols-1 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Mevcut şifre
          </span>
          <Input
            type="password"
            value={form.current}
            onChange={(e) => set("current", e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Yeni şifre (en az 12 karakter)
          </span>
          <Input
            type="password"
            value={form.next}
            onChange={(e) => set("next", e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Yeni şifre (tekrar)
          </span>
          <Input
            type="password"
            value={form.confirm}
            onChange={(e) => set("confirm", e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <div>
          <Button
            size="sm"
            loading={change.isPending}
            // Mevcut şifre boşken de kapalı (arayüz testi FX-00 D-223: alansız
            // "Bu alan zorunlu" dönüyordu). Promise döner → admin Button iş
            // bitene dek kilitli, çift tık ikinci istek atmaz.
            disabled={!form.current || form.next.length < 12 || form.next !== form.confirm}
            onClick={() =>
              change.mutateAsync({ current: form.current, next: form.next }).then(
                () => {
                  toast.success("Şifre değiştirildi");
                  setForm({ current: "", next: "", confirm: "" });
                },
                (e: unknown) => toastApiError(e),
              )
            }
          >
            Değiştir
          </Button>
          {form.next && form.next !== form.confirm ? (
            <span className="ml-3 text-xs text-red-600">
              Şifreler eşleşmiyor
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TwoFactorSection() {
  const me = useAdminMe();
  const { setup, enable, disable } = useTwoFactor();
  const [pending, setPending] = useState<{
    secret: string;
    otpauthUrl: string;
    qrDataUrl?: string;
  } | null>(null);
  const [code, setCode] = useState("");
  // `/me` yüklenirken durum BİLİNMİYOR: "Kapalı" + "2FA Kur" çizilmez (2FA'sı
  // açık hesapta kurulum "zaten etkin" hatasına düşüyordu — FX-00 D-223).
  const known = me.data !== undefined;
  const enabled = me.data?.twoFactorEnabled ?? false;

  const err = (e: unknown) => toastApiError(e);

  return (
    <section className="admin-card px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-admin-text flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" /> İki Adımlı Doğrulama (2FA)
        </h3>
        {known ? (
          <Badge color={enabled ? "green" : "zinc"}>
            {enabled ? "Etkin" : "Kapalı"}
          </Badge>
        ) : (
          <span
            aria-hidden
            className="h-5 w-14 animate-pulse rounded-md bg-zinc-200"
          />
        )}
      </div>

      {!known ? (
        <div
          aria-busy="true"
          className="mt-3 h-16 animate-pulse rounded-lg bg-zinc-100"
        />
      ) : null}

      {known && !enabled && !pending ? (
        <div className="mt-3">
          <p className="text-admin-text-muted text-sm">
            Girişte şifreye ek olarak authenticator uygulaması kodu istenir —
            yüksek yetkili hesaplar için şiddetle önerilir.
          </p>
          <Button
            size="sm"
            className="mt-2"
            loading={setup.isPending}
            onClick={() =>
              setup.mutateAsync().then((d) => {
                setPending(d);
                setCode("");
              }, err)
            }
          >
            2FA Kur
          </Button>
        </div>
      ) : null}

      {pending ? (
        <div className="mt-3 space-y-3">
          {pending.qrDataUrl ? (
            <>
              <p className="text-admin-text text-sm">
                1. Authenticator uygulamanızla (Google Authenticator, 1Password,
                Authy...) QR kodu okutun ya da anahtarı elle ekleyin:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pending.qrDataUrl}
                alt="2FA QR kodu"
                className="h-44 w-44 rounded-lg border border-zinc-200"
              />
            </>
          ) : (
            <p className="text-admin-text text-sm">
              1. Authenticator uygulamanıza (Google Authenticator, 1Password,
              Authy...) aşağıdaki anahtarı <strong>manuel</strong> ekleyin:
            </p>
          )}
          <div className="flex items-center gap-2">
            <code className="bg-admin-border/30 rounded px-2 py-1 font-mono text-sm break-all">
              {pending.secret}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(pending.secret);
                toast.success("Kopyalandı");
              }}
              className="text-admin-text-muted rounded p-1 hover:bg-zinc-100"
              aria-label="Anahtarı kopyala"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="text-admin-text text-sm">
            2. Uygulamanın ürettiği 6 haneli kodu girin:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Catalyst Input'un kendi w-full'u className genişliğini ezer →
                sabit genişlik sarmalayıcıda; düğmeler daralıp metni kırmaz (D-169). */}
            <div className="w-32 shrink-0">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                aria-label="2FA doğrulama kodu"
              />
            </div>
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              loading={enable.isPending}
              disabled={code.trim().length !== 6}
              onClick={() =>
                enable.mutateAsync({ secret: pending.secret, code: code.trim() }).then(() => {
                  toast.success("2FA etkinleştirildi");
                  setPending(null);
                  setCode("");
                }, err)
              }
            >
              Etkinleştir
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                setPending(null);
                setCode("");
              }}
            >
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}

      {known && enabled ? (
        <div className="mt-3 space-y-2">
          <p className="text-admin-text-muted text-sm">
            Kapatmak için authenticator kodunuzu girin:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Catalyst Input'un kendi w-full'u className genişliğini ezer →
                sabit genişlik sarmalayıcıda; düğmeler daralıp metni kırmaz (D-169). */}
            <div className="w-32 shrink-0">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                aria-label="2FA kapatma kodu"
              />
            </div>
            <Button
              variant="danger"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              loading={disable.isPending}
              disabled={code.trim().length !== 6}
              onClick={() =>
                disable.mutateAsync({ code: code.trim() }).then(() => {
                  toast.success("2FA kapatıldı");
                  setCode("");
                }, err)
              }
            >
              2FA'yı Kapat
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminShell>
      <div className="max-w-[720px] space-y-6">
        <PageHeader
          title="Ayarlar"
          description="Hesap güvenliği — şifre ve iki adımlı doğrulama."
        />
        {/* 2FA zorunluysa neden kilitli olduğunu anlatır; akışta, düğmeleri
            örtmez (GB1). */}
        <TwoFactorSetupNotice />
        {/* Geçici parolayla girildiyse (D-025) panel şifre değişene dek kilitli. */}
        <PasswordChangeRequiredNotice />
        <PasswordSection />
        <TwoFactorSection />
      </div>
    </AdminShell>
  );
}
