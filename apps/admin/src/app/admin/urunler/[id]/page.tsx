"use client";

import { Badge } from "@/components/catalyst/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { useAdminProductDetail, useProductReview } from "@/hooks/use-admin-products";
import { safeFormat } from "@/lib/date";
import { PRODUCT_REVIEW_STATUS } from "@/lib/status-labels";
import { ArrowLeft, Check, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const WEB = process.env.NEXT_PUBLIC_WEB_URL ?? "https://www.rothern.com";

const PRICE_MODE: Record<string, string> = { FIXED: "Sabit fiyat", TIERED: "Kademeli", ON_REQUEST: "Teklif isteyin" };

/**
 * ÜRÜN İNCELEME — ziyaretçinin göreceği her şey burada (görseller, açıklama,
 * nitelikler, fiyat/MOQ, belgeler) + firma bağlamı. Karar: Onayla → anında
 * vitrin; Düzeltmeye gönder → gerekçe zorunlu (≥10 karakter), firmaya e-posta +
 * bildirim; firma bu karara kadar ürünü DEĞİŞTİREMEZ (inceleme kilidi,
 * 2026-09-10) — düzeltme isteği kilidi açar, firma düzenleyip yeniden gönderir.
 */
function ProductReview({ id }: { id: string }) {
  const { data: p, isLoading, isError, refetch } = useAdminProductDetail(id);
  const act = useProductReview(id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Hata");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-admin-text-muted h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isError || !p) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-admin-text-muted text-sm">Ürün yüklenemedi.</p>
        <Button variant="secondary" onClick={() => void refetch()}>Tekrar dene</Button>
      </div>
    );
  }
  const meta = PRODUCT_REVIEW_STATUS[p.reviewStatus] ?? { label: p.reviewStatus, color: "zinc" as const };
  const pending = p.reviewStatus === "PENDING";

  return (
    <div className="max-w-[1100px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/admin/urunler" className="text-admin-text-muted hover:text-admin-text mb-2 inline-flex items-center gap-1 text-xs font-medium">
            <ArrowLeft className="h-3.5 w-3.5" /> Ürün kuyruğu
          </Link>
          <h1 className="text-admin-text text-xl font-semibold">{p.name}</h1>
          <p className="text-admin-text-muted mt-1 text-sm">
            <Link href={`/admin/firmalar/${p.company.id}`} className="hover:underline">{p.company.name}</Link>
            {p.company.city ? ` · ${p.company.city}` : ""} · {p.company.tier} · {p.company.verification}
            {p.company.isBlocked ? " · ASKIDA" : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge color={meta.color}>{meta.label}</Badge>
            {pending && p.isPublic ? <Badge color="blue">yayında · yeniden inceleme</Badge> : null}
            {p.submittedAt ? <span className="text-admin-text-muted text-xs">gönderim {safeFormat(p.submittedAt, "d MMM yyyy HH:mm")}</span> : null}
            {p.reviewedAt ? <span className="text-admin-text-muted text-xs">karar {safeFormat(p.reviewedAt, "d MMM yyyy HH:mm")}</span> : null}
          </div>
          {p.rejectReason ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-600/20">Düzeltme gerekçesi: {p.rejectReason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.publicUrl && p.isPublic ? (
            <a href={`${WEB}${p.publicUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
              <ExternalLink className="h-4 w-4" /> Sitede aç
            </a>
          ) : null}
          {pending ? (
            <>
              <Button variant="danger" disabled={act.isPending} onClick={() => setRejectOpen(true)}>
                <X className="h-4 w-4" /> Düzeltmeye gönder
              </Button>
              <Button
                disabled={act.isPending}
                onClick={() =>
                  act.mutateAsync({ action: "approve" }).then(() => toast.success("Ürün onaylandı ve yayına alındı")).catch(err)
                }
              >
                <Check className="h-4 w-4" /> Onayla ve yayınla
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section className="admin-card p-5">
            <h2 className="text-admin-text mb-3 text-sm font-semibold">Görseller ({p.imageCount})</h2>
            {p.imageCount === 0 ? (
              <p className="text-admin-text-muted text-sm">Görsel yok.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {p.images.map((src) => (
                  <li key={src} className="aspect-square overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-950/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="size-full object-cover" /></a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-card p-5">
            <h2 className="text-admin-text mb-3 text-sm font-semibold">Açıklama</h2>
            <p className="text-admin-text whitespace-pre-line text-sm/6">{p.description ?? "—"}</p>
            {p.keywords.length ? (
              <p className="mt-3 flex flex-wrap gap-1.5">
                {p.keywords.map((k) => <Badge key={k} color="zinc">{k}</Badge>)}
              </p>
            ) : null}
          </section>

          <section className="admin-card p-5">
            <h2 className="text-admin-text mb-3 text-sm font-semibold">Teknik nitelikler</h2>
            {p.attributeList.length === 0 ? (
              <p className="text-admin-text-muted text-sm">Nitelik girilmemiş.</p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {p.attributeList.map((a) => (
                  <div key={a.key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-admin-text-muted">{a.label}</dt>
                    <dd className="text-admin-text text-right font-medium">{a.value}{a.unit ? ` ${a.unit}` : ""}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="admin-card p-5 text-sm">
            <h2 className="text-admin-text mb-3 font-semibold">Ticari</h2>
            <dl className="space-y-2">
              <Row k="Kategori" v={p.categoryName ?? "—"} />
              <Row k="Fiyat" v={`${PRICE_MODE[p.priceMode] ?? p.priceMode}${p.priceMode === "FIXED" && p.priceAmount ? ` · ${p.priceAmount} ${p.priceCurrency}/${p.unit}` : ""}`} />
              {p.priceMode === "TIERED" && p.priceTiers?.length ? (
                <Row k="Kademeler" v={p.priceTiers.map((t) => `${t.minQty}+ → ${t.unitPrice} ${p.priceCurrency}`).join(" · ")} />
              ) : null}
              <Row k="Min. sipariş" v={p.moq ? `${p.moq} ${p.unit}` : "—"} />
              <Row k="Marka / MPN" v={[p.brand, p.mpn].filter(Boolean).join(" / ") || "—"} />
              <Row k="Tamamlanma" v={`%${p.completionScore ?? 0}`} />
            </dl>
          </section>
          <section className="admin-card p-5 text-sm">
            <h2 className="text-admin-text mb-3 font-semibold">Ekler</h2>
            <dl className="space-y-2">
              <Row k="Video" v={p.videoUrl ?? "—"} />
              <Row k="Dış bağlantı" v={p.externalUrl ?? "—"} />
              <Row k="Belgeler" v={p.documents?.length ? p.documents.map((d) => d.title).join(", ") : "—"} />
            </dl>
          </section>
          <p className="text-admin-text-muted text-xs/5">
            Onay: ürün anında vitrine çıkar, arama motorlarına bildirilir. Düzeltmeye gönder: gerekçe firmaya e-posta ve bildirimle gider; firma ancak bu karardan sonra ürünü düzenleyip yeniden gönderebilir (incelemedeyken kilitli). Yayındaki ürün düzeltme tamamlanana kadar vitrinden çekilir.
          </p>
        </aside>
      </div>

      <PromptDialog
        open={rejectOpen}
        title="Düzeltmeye gönder"
        description="Gerekçe firmaya iletilir — neyin düzeltilmesi gerektiğini yazın (en az 10 karakter). Firma düzeltip yeniden onaya gönderir."
        label="Gerekçe"
        placeholder="Örn. görseller ürüne ait değil; açıklama fiyat/iletişim bilgisi içeriyor…"
        confirmLabel="Düzeltmeye gönder"
        required
        maxLength={500}
        onConfirm={(reason) => {
          setRejectOpen(false);
          act.mutateAsync({ action: "reject", reason }).then(() => toast.success("Düzeltmeye gönderildi, firma bilgilendirildi")).catch(err);
        }}
        onClose={() => setRejectOpen(false)}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-admin-text-muted shrink-0">{k}</dt>
      <dd className="text-admin-text text-right font-medium break-words">{v}</dd>
    </div>
  );
}

export default function AdminUrunDetayPage() {
  const params = useParams<{ id: string }>();
  return (
    <AdminShell>
      <ProductReview id={params.id} />
    </AdminShell>
  );
}
