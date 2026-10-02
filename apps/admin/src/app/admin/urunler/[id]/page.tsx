"use client";

import { CompanyLink } from "@/components/ui/company-link";
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
import { toastApiError } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { canAdminDo } from "@/lib/admin-permissions";
import { safeHttpUrl, WEB_ORIGIN, webAssetUrl } from "@/lib/safe-url";
import { companyTierText, metaOf, VERIFY_META } from "@/lib/terms";

const PRICE_MODE: Record<string, string> = { FIXED: "Sabit fiyat", TIERED: "Kademeli", ON_REQUEST: "Teklif isteyin" };

/**
 * Fiyat — "11.5 TRY" yerine "₺11,50" (arayüz testi D-130). Bilinmeyen para
 * birimi kodunda Intl hata atar; o zaman kod sonda yazılır.
 */
function fmtPrice(v: number | string | null | undefined, currency: string): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

/** Miktar — "1000.000" yerine "1.000". */
function fmtQty(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n == null || !Number.isFinite(n)) return String(v ?? "—");
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
}

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
  const err = (e: unknown) => toastApiError(e);
  // Ürün kararı SUPER_ADMIN+SUPPORT; SALES kuyruğu yalnız okur.
  const { admin } = useAdminAuth();
  const canReview = canAdminDo(admin?.role, "reviewProduct");

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
            <CompanyLink href={`/admin/firmalar/${p.company.id}`} className="hover:underline">{p.company.name}</CompanyLink>
            {p.company.city ? ` · ${p.company.city}` : ""} · {companyTierText(p.company)} · {metaOf(VERIFY_META, p.company.verification).label}
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
            <a href={`${WEB_ORIGIN}${p.publicUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
              <ExternalLink className="h-4 w-4" /> Sitede aç
            </a>
          ) : null}
          {pending && canReview ? (
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
                {p.images.map((raw) => {
                  // Göreli yol (`/categories/*.webp`) vitrin kökeninde çözülür (D-157).
                  const src = webAssetUrl(raw);
                  return (
                    <li key={raw} className="aspect-square overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-950/10">
                      {src ? (
                        <a href={src} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt="" className="size-full object-cover" />
                        </a>
                      ) : null}
                    </li>
                  );
                })}
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
              <Row k="Fiyat" v={`${PRICE_MODE[p.priceMode] ?? p.priceMode}${p.priceMode === "FIXED" && p.priceAmount ? ` · ${fmtPrice(p.priceAmount, p.priceCurrency)}/${p.unit}` : ""}`} />
              {p.priceMode === "TIERED" && p.priceTiers?.length ? (
                // Her kademe kendi satırında ve bölünmeden — tek dizeye "·" ile
                // birleştirince sağa yaslı hücrede kademe ortasından sarılıyordu.
                <Row
                  k="Kademeler"
                  v={
                    <ul className="space-y-0.5">
                      {p.priceTiers.map((t, i) => (
                        <li key={`${i}-${t.minQty}`} data-testid="price-tier" className="whitespace-nowrap">
                          {`${fmtQty(t.minQty)}+ ${p.unit} → ${fmtPrice(t.unitPrice, p.priceCurrency)}`}
                        </li>
                      ))}
                    </ul>
                  }
                />
              ) : null}
              <Row k="Min. sipariş" v={p.moq ? `${fmtQty(p.moq)} ${p.unit}` : "—"} />
              <Row k="Marka / MPN" v={[p.brand, p.mpn].filter(Boolean).join(" / ") || "—"} />
              <Row k="Tamamlanma" v={`%${p.completionScore ?? 0}`} />
            </dl>
          </section>
          <section className="admin-card p-5 text-sm">
            <h2 className="text-admin-text mb-3 font-semibold">Ekler</h2>
            {/* İnceleyen eki açıp kontrol edebilmeli; yalnız http(s) bağlantı olur (O-077). */}
            <dl className="space-y-2">
              <Row k="Video" v={<ExtLink href={p.videoUrl} />} />
              <Row k="Dış bağlantı" v={<ExtLink href={p.externalUrl} />} />
              <div>
                <dt className="text-admin-text-muted">Belgeler</dt>
                {p.documents?.length ? (
                  <dd className="mt-1">
                    <ul className="space-y-1">
                      {p.documents.map((d, i) => {
                        const href = webAssetUrl(d.url);
                        return (
                          <li key={`${i}-${d.title}`} className="text-admin-text font-medium break-words">
                            {href ? (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                                {d.title || "Belge"} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              </a>
                            ) : (
                              d.title || "Belge"
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                ) : (
                  <dd className="text-admin-text font-medium">—</dd>
                )}
              </div>
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
        minLength={10}
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

/** Dış adres — http(s) ise yeni sekmede açılan bağlantı, değilse düz metin. */
function ExtLink({ href }: { href: string | null }) {
  if (!href) return <>—</>;
  const safe = safeHttpUrl(href);
  if (!safe) return <>{href}</>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-blue-700 hover:underline">
      {href} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
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
