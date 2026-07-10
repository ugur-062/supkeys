"use client";

import { Button } from "@/components/ui/button";
import type { AdminCompanyDetail } from "@/hooks/use-admin-companies";
import { countryLabel } from "@/lib/country";
import { safeFormat } from "@/lib/date";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { EditProfileDialog } from "../edit-profile-dialog";

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

/** Özet — kimlik + iletişim + sayaçlar + kimlik düzeltme. */
export function SummaryTab({ data }: { data: AdminCompanyDetail }) {
  const [editing, setEditing] = useState(false);
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
