"use client";

import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import type { AdminCompanyDetail } from "@/hooks/use-admin-companies";
import { api } from "@/lib/api";
import { countryLabel } from "@/lib/country";
import { safeFormat } from "@/lib/date";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditProfileDialog } from "../edit-profile-dialog";

/** KVKK — veri export (JSON indir) + firma silme/anonimleştirme. */
function DangerZone({ data }: { data: AdminCompanyDetail }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const expected = data.rothernId ?? data.id.slice(0, 8);

  const exportJson = async () => {
    setBusy(true);
    try {
      const { data: payload } = await api.get<unknown>(
        `/admin/companies/${data.id}/export`,
      );
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kvkk-export-${expected}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Veri export'u indirildi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hata");
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.delete<{ mode: string }>(
        `/admin/companies/${data.id}`,
      );
      toast.success(
        res.mode === "deleted"
          ? "Firma kalıcı olarak silindi"
          : "Firma anonimleştirildi (siparişli — finansal kayıt korundu)",
      );
      router.push("/admin/firmalar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hata");
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/50 px-5 py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
        <AlertTriangle className="h-4 w-4" /> KVKK / Tehlikeli Alan
      </h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={exportJson}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Veri Export (JSON)
        </Button>
      </div>
      <div className="mt-4 border-t border-red-200 pt-3">
        <p className="text-xs text-red-800">
          <strong>Firmayı sil:</strong> siparişi yoksa KALICI silinir; siparişi
          varsa finansal kayıt korunur, kimlik <strong>anonimleştirilir</strong>{" "}
          (geri alınamaz). Onay için firma kodunu yazın:{" "}
          <code className="rounded bg-white px-1 font-mono">{expected}</code>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expected}
            aria-label="Silme onayı — firma kodu"
            className="w-40 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-mono text-sm"
          />
          <Button
            variant="danger"
            size="sm"
            disabled={busy || confirmText.trim() !== expected}
            onClick={destroy}
          >
            Kalıcı Olarak Sil / Anonimleştir
          </Button>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-admin-text-muted text-xs font-medium">{label}</dt>
      <dd className="text-admin-text text-sm break-words">{value || "—"}</dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="admin-card px-4 py-3">
      <p className="text-admin-text-muted text-xs font-medium">{label}</p>
      <p className="text-admin-text mt-1 text-2xl font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}

/** Özet — kimlik + iletişim + sayaçlar + kimlik düzeltme + KVKK. */
export function SummaryTab({ data }: { data: AdminCompanyDetail }) {
  const [editing, setEditing] = useState(false);
  const { admin } = useAdminAuth();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Kullanıcı" value={data._count.users} />
        <StatCard label="İlan" value={data._count.listings} />
        <StatCard label="Şikayet (toplam)" value={data._count.complaintsReceived} />
        <StatCard label="Açık şikayet" value={data.openComplaints} />
      </div>

      <section className="admin-card px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-admin-text text-sm font-semibold">
            Kimlik Bilgileri
          </h3>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Düzenle
          </Button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Row label="Ünvan" value={data.legalName} />
          <Row label="Vergi No" value={data.taxNumber} />
          <Row label="Vergi Dairesi" value={data.taxOffice} />
          <Row label="MERSİS No" value={data.mersisNo} />
          <Row label="Ticari Sicil No" value={data.tradeRegistryNo} />
          <Row label="Ülke" value={countryLabel(data.country)} />
          <Row
            label="Bölge / Şehir"
            value={[data.stateRegion, data.city].filter(Boolean).join(" / ")}
          />
          <Row label="Adres" value={data.addressLine} />
          <Row label="Sektör" value={data.industry} />
          <Row
            label="Web sitesi"
            value={
              data.website ? (
                <a
                  href={data.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {data.website}
                </a>
              ) : null
            }
          />
          <Row label="Fatura e-postası" value={data.billingEmail} />
          <Row label="IBAN" value={data.iban} />
          <Row label="IBAN Sahibi" value={data.ibanHolder} />
          <Row label="Kayıt tarihi" value={safeFormat(data.createdAt, "d MMM yyyy HH:mm")} />
          <Row
            label="Doğrulama tarihi"
            value={
              data.companyVerifiedAt
                ? safeFormat(data.companyVerifiedAt, "d MMM yyyy HH:mm")
                : null
            }
          />
        </dl>
        {data.companyRejectionReason ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            Red gerekçesi: {data.companyRejectionReason}
          </p>
        ) : null}
      </section>

      {/* KVKK tehlikeli alan — yalnız SUPER_ADMIN (BE guard asıl sınır). */}
      {admin?.role === "SUPER_ADMIN" ? <DangerZone data={data} /> : null}

      {editing ? (
        <EditProfileDialog
          companyId={data.id}
          data={data}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
