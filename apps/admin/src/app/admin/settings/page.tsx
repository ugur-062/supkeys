"use client";

import { Input } from "@/components/ui/input";
import { AdminShell } from "@/components/layout/admin-shell";
import { PasswordChangeRequiredNotice } from "@/components/layout/admin-session-notices";
import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import { useChangePassword } from "@/hooks/use-admin-staff";
import { KeyRound } from "lucide-react";
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

export default function AdminSettingsPage() {
  return (
    <AdminShell>
      <div className="max-w-[720px] space-y-6">
        <PageHeader
          title="Ayarlar"
          description="Hesap güvenliği — şifre."
        />
        {/* Geçici parolayla girildiyse (D-025) panel şifre değişene dek kilitli. */}
        <PasswordChangeRequiredNotice />
        <PasswordSection />
      </div>
    </AdminShell>
  );
}
