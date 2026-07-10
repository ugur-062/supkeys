"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/catalyst/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import { useAdminCompanyStats } from "@/hooks/use-admin-companies";
import { useAnnounce } from "@/hooks/use-admin-support";
import { countryFlag, countryName } from "@/lib/country";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Platform duyurusu — tüm firmalara veya segmente (üyelik/ülke) toplu
 * uygulama-içi bildirim + opsiyonel e-posta. Yalnız SUPER_ADMIN (BE guard).
 */
function DuyuruView() {
  const announce = useAnnounce();
  const stats = useAdminCompanyStats();
  const [form, setForm] = useState({
    subject: "",
    message: "",
    tier: "",
    country: "",
    sendEmail: false,
  });
  const [confirming, setConfirming] = useState(false);

  const set = (k: string, v: string | boolean) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const send = () => {
    announce.mutate(
      {
        subject: form.subject.trim(),
        message: form.message.trim(),
        tier: (form.tier || undefined) as "PAKET" | "STANDARD" | undefined,
        country: form.country || undefined,
        sendEmail: form.sendEmail,
      },
      {
        onSuccess: (r) => {
          toast.success(
            `Duyuru gönderildi — ${r.delivered}/${r.targets} firma`,
          );
          setForm({
            subject: "",
            message: "",
            tier: "",
            country: "",
            sendEmail: false,
          });
          setConfirming(false);
        },
        onError: (e: unknown) => {
          toast.error(e instanceof Error ? e.message : "Hata");
          setConfirming(false);
        },
      },
    );
  };

  return (
    <div className="max-w-[720px] space-y-6">
      <PageHeader
        title="Duyuru"
        description="Tüm firmalara veya segmente toplu bildirim — dikkatli kullanın."
      />

      <section className="admin-card space-y-4 px-5 py-4">
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Konu
          </span>
          <Input
            value={form.subject}
            onChange={(e) => set("subject", e.target.value)}
            placeholder="Örn. Planlı bakım bildirimi"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Mesaj
          </span>
          <Textarea
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            rows={5}
            placeholder="Duyuru metni..."
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              Üyelik segmenti
            </span>
            <Select
              value={form.tier}
              onChange={(e) => set("tier", e.target.value)}
            >
              <option value="">Tüm üyelikler</option>
              <option value="PAKET">Yalnız Premium</option>
              <option value="STANDARD">Yalnız Standart</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              Ülke segmenti
            </span>
            <Select
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            >
              <option value="">Tüm ülkeler</option>
              {(stats.data?.countryBreakdown ?? []).map((c) => (
                <option key={c.country} value={c.country}>
                  {countryFlag(c.country)} {countryName(c.country)} ({c.count})
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.sendEmail}
            onChange={(e) => set("sendEmail", e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <span className="text-admin-text text-sm">
            E-posta olarak da gönder{" "}
            <span className="text-admin-text-muted text-xs">
              (yalnız uygulama-içi bildirim için işaretsiz bırakın)
            </span>
          </span>
        </label>

        {confirming ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-800">
              Bu duyuru seçili segmentteki <strong>tüm firmalara</strong>{" "}
              gidecek{form.sendEmail ? " (e-posta dahil)" : ""}. Emin misiniz?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={announce.isPending}
                onClick={send}
              >
                Evet, Gönder
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Vazgeç
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              disabled={
                form.subject.trim().length < 3 || form.message.trim().length < 10
              }
              onClick={() => setConfirming(true)}
            >
              <Megaphone className="mr-1.5 h-4 w-4" /> Duyuruyu Gönder
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AdminDuyuruPage() {
  return (
    <AdminShell>
      <DuyuruView />
    </AdminShell>
  );
}
