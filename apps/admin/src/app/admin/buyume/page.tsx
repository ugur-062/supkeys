"use client";

import { Badge } from "@/components/catalyst/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/list";
import { StatCard } from "@/components/ui/stat-card";
import { useGrowthReport } from "@/hooks/use-admin-growth";
import { useState } from "react";

/**
 * BÜYÜME — kayıtsız adreslere davet hunisi ve e-posta sağlığı (2026-09-27, Faz 4).
 * Davet → e-posta → teslim → tıklama → kayıt → teklif; iptal nedenleri; kaynak/
 * ülke/dil; soğuk davet alan adı sağlığı (tavan, şikâyet, geri dönme); AI keşif
 * maliyeti; günlük program e-postaları. Yalnız sayılar.
 */
const CANCEL_LABEL: Record<string, string> = {
  OPTED_OUT: "Davet almak istemiyor",
  REGISTERED: "Arada kayıt oldu",
  LISTING_CLOSED: "Talep kapandı",
  PAUSED: "3 yanıtsız e-posta (durduruldu)",
  FREQUENCY: "7 gün kuralı — kapanıştan önce sıra gelmedi",
  SUPPRESSED: "Adres e-posta almıyor",
  REFERRAL_CANCELLED: "Davet eden iptal etti",
  OTHER: "Diğer",
};
const SOURCE_LABEL: Record<string, string> = { MANUAL: "Elle yazılan", AI_FORM: "AI (talep formu)", AI_AUTO: "AI (yayın sonrası)" };
const PROGRAM_LABEL: Record<string, string> = {
  listing_category_digest: "Akşam özeti (kategori)",
  listing_zero_bid: "Teklifsiz talep hatırlatması",
  ai_supplier_suggestions: "AI tedarikçi önerisi (alıcıya)",
  lifecycle_profile: "Karşılama: profil",
  lifecycle_first_product: "Karşılama: ilk ürün",
  lifecycle_verify: "Karşılama: doğrulama",
  lifecycle_market: "Karşılama: pazar",
  lifecycle_weekly: "Haftalık görünürlük özeti",
};

const pct = (n: number, d: number) => (d > 0 ? `%${Math.round((n / d) * 1000) / 10}` : "—");

function GrowthView() {
  const [days, setDays] = useState(30);
  const q = useGrowthReport(days);
  const r = q.data;

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Büyüme"
        description="Kayıtsız tedarikçilere davet hunisi, soğuk davet e-posta sağlığı ve AI tedarikçi keşfi."
      />
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              d === days ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-950/10 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Son {d} gün
          </button>
        ))}
      </div>

      {q.isLoading ? <p className="text-sm text-zinc-500">Yükleniyor…</p> : null}
      {q.isError ? <p className="text-sm text-red-700">Rapor yüklenemedi.</p> : null}

      {r ? (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">Davet hunisi</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <StatCard label="Talep daveti" value={r.funnel.invited} />
              <StatCard label="E-postası giden" value={r.funnel.emailed} />
              <StatCard label="Davet e-postası" value={r.funnel.emails} />
              <StatCard label={`Teslim (${pct(r.funnel.delivered, r.funnel.emails)})`} value={r.funnel.delivered} />
              <StatCard label={`Tıklayan (${pct(r.funnel.clicked, r.funnel.emailed)})`} value={r.funnel.clicked} />
              <StatCard label={`Kayıt olan (${pct(r.funnel.signedUp, r.funnel.clicked)})`} value={r.funnel.signedUp} accent="emerald" />
              <StatCard label={`Teklif veren (${pct(r.funnel.quoted, r.funnel.signedUp)})`} value={r.funnel.quoted} accent="emerald" />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">Soğuk davet sağlığı</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Bugünkü tavan" value={r.health.cap} />
              <StatCard label="Bugün gönderilen" value={r.health.sentToday} />
              <StatCard label={`Şikâyet (7 gün) — eşik %0,1`} value={`%${r.health.complaintRatePct}`} />
              <StatCard label={`Kalıcı geri dönme (7 gün) — eşik %2`} value={`%${r.health.bounceRatePct}`} />
            </div>
            {r.health.braked ? (
              <Badge color="red">
                Fren devrede: {r.health.braked === "complaints" ? "şikâyet oranı yüksek" : "geri dönme oranı yüksek"} — tavan
                düşürüldü
              </Badge>
            ) : (
              <Badge color="green">Fren yok — tavan ısınma planına göre artıyor</Badge>
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-900">İptal nedenleri</h2>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Neden</TableHeader>
                    <TableHeader className="text-right">Adet</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(r.cancelled).map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell>{CANCEL_LABEL[k] ?? k}</TableCell>
                      <TableCell className="text-right tabular-nums">{v}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-900">Kaynak</h2>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Kaynak</TableHeader>
                    <TableHeader className="text-right">Davet</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(r.bySource).map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell>{SOURCE_LABEL[k] ?? k}</TableCell>
                      <TableCell className="text-right tabular-nums">{v}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-900">Ülke (ilk 20)</h2>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Ülke</TableHeader>
                    <TableHeader className="text-right">Davet</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {r.byCountry.map((c) => (
                    <TableRow key={c.country}>
                      <TableCell>{c.country}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.invited}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-900">Dil</h2>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Dil</TableHeader>
                    <TableHeader className="text-right">Davet</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {r.byLocale.map((c) => (
                    <TableRow key={c.locale}>
                      <TableCell>{c.locale}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.invited}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">AI tedarikçi keşfi (yayın sonrası)</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Tamamlanan tur" value={r.discovery.runs.DONE ?? 0} />
              <StatCard label="Başarısız tur" value={r.discovery.runs.FAILED ?? 0} />
              <StatCard label="Platform maliyeti (USD)" value={r.discovery.costUsd.toFixed(2)} />
              <StatCard label="Davet edilen aday" value={r.discovery.candidates.INVITED ?? 0} />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900">Günlük e-posta programı</h2>
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>E-posta</TableHeader>
                  <TableHeader className="text-right">Gönderilen</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(r.programs).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell>{PROGRAM_LABEL[k] ?? k}</TableCell>
                    <TableCell className="text-right tabular-nums">{v}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-zinc-600">
              Abonelikten çıkan: {r.optOuts.email} adres (bildirim) · {r.optOuts.invite} adres (davet)
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function AdminBuyumePage() {
  return (
    <AdminShell>
      <GrowthView />
    </AdminShell>
  );
}
