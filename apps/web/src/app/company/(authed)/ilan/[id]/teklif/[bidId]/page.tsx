"use client";

import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading, Subheading } from "@/components/catalyst/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import {
  BID_DOC_KIND_LABELS,
  BID_DOC_KINDS,
  useBidDocuments,
} from "@/hooks/use-bid-documents";
import {
  useAwardListing,
  useEliminateBid,
  useListingDetail,
} from "@/hooks/use-company-listings";
import { formatDateTime } from "@/lib/tenders/date";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatMoney } from "@/components/ui/money";
import { bidDeliveryTimeLabel } from "@rothern/shared";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { canManageListing } from "@/lib/tenders/can-manage-listing";
import { toast } from "sonner";

export default function BidDetailPage() {
  const params = useParams<{ id: string; bidId: string }>();
  const { id, bidId } = params;
  const { data: l, isLoading, isError, refetch } = useListingDetail(id);
  const confirm = useConfirm();
  const award = useAwardListing(id);
  const eliminate = useEliminateBid(id);
  const bidDocs = useBidDocuments(id);
  const [eliminateOpen, setEliminateOpen] = useState(false);
  // B4: ihale detayındaki kapının AYNISI (backend assertListingManageRole
  // aynası) — hook'lar koşulsuz çağrılmalı, bu yüzden erken dönüşlerden ÖNCE.
  const { user } = useCompanyAuth();
  const hasManagePermission = useHasCompanyPermission(
    l?.type === "SATIS" ? "sell:listing:manage" : "buy:listing:manage",
  );
  const canManage = canManageListing({
    hasManagePermission,
    createdById: l?.createdById,
    userId: user?.id,
  });

  if (isLoading)
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  if (isError)
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <Text className="text-sm text-red-700">Teklif yüklenemedi.</Text>
        <Button outline className="mt-3" onClick={() => refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  if (!l)
    return <Text className="text-sm text-zinc-500">İlan bulunamadı.</Text>;

  const bid = (l.bids ?? []).find((b) => b.id === bidId);
  if (!bid)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          href={`/company/ilan/${id}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Satın Alma Talebi
        </Link>
        <Text className="text-sm text-zinc-500">Teklif bulunamadı.</Text>
      </div>
    );

  const items = l.items ?? [];
  // B4 (denetim 2026-08-26 Parça 10): bu sayfada `canManage` kapısı YOKTU —
  // ilanı AÇMAYAN izinli bir operatöre (ve işlem-rolsüz Kurucu'ya) kazandır/ele
  // düğmeleri gösteriliyordu; ihale detayında bilinçle gizlenen yıkıcı butonlar
  // burada açıktı (API `assertListingManageRole` ile 403 veriyordu).
  const canDecide =
    (l.status === "OPEN" || l.status === "IN_AWARD") && canManage;
  const docs = (bidDocs.data ?? []).filter((d) => d.bidId === bid.id);

  const priceFor = (itemId: string) =>
    bid.items?.find((x) => x.itemId === itemId)?.unitPrice;

  const handleAward = async () => {
    if (
      !(await confirm({
        title: "Kazandır",
        description: `"${bid.bidderName}" kazandırılsın mı? Sipariş oluşacak.`,
        confirmLabel: "Kazandır",
      }))
    )
      return;
    try {
      const res = await award.mutateAsync({ bidId: bid.id });
      toast.success(
        res.pendingApproval
          ? "Kazandırma onaya gönderildi"
          : `Kazandırıldı — sipariş ${res.number} oluştu`,
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kazandırılamadı"));
    }
  };

  const submitEliminate = async (reason: string) => {
    try {
      await eliminate.mutateAsync({
        bidId: bid.id,
        reason: reason.trim() || undefined,
      });
      toast.success("Teklif elendi");
      setEliminateOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Elenemedi"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/company/ilan/${id}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {l.title}
      </Link>

      {/* Başlık kartı */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {bid.status === "WON" ? (
                <Badge color="green">Kazandı</Badge>
              ) : bid.status === "AWARDED_PARTIAL" ? (
                <Badge color="green">Kısmen Kazandı</Badge>
              ) : bid.status === "LOST" ? (
                <Badge color="zinc">Elendi</Badge>
              ) : (
                <Badge color="blue">Değerlendirmede</Badge>
              )}
              {bid.isBuyNow ? <Badge color="emerald">Hemen Al</Badge> : null}
              {bid.round ? <Badge color="zinc">Tur {bid.round}</Badge> : null}
            </div>
            <Heading>{bid.bidderName}</Heading>
            <Text className="text-sm text-zinc-500">
              {formatDateTime(bid.createdAt)}
            </Text>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums text-zinc-950">
              {formatMoney(bid.amount, bid.currency ?? "TRY")}
            </div>
            {bid.currency && bid.currency !== "TRY" ? (
              <div className="text-xs text-zinc-500">
                {bid.amountTry != null
                  ? `≈ ${formatMoney(bid.amountTry, "TRY")}`
                  : "TRY karşılığı yok (kur alınamadı)"}
              </div>
            ) : null}
            {bid.bidderCompanyId ? (
              <Link
                href={`/company/mesajlar?with=${bid.bidderCompanyId}&portal=${l.type === "SATIS" ? "satis" : "satinalma"}`}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Mesaj Gönder
              </Link>
            ) : null}
          </div>
        </div>

        {canDecide && bid.status === "SUBMITTED" ? (
          <div className="mt-4 flex justify-end gap-2 border-t border-zinc-100 pt-4">
            <Button
              plain
              onClick={() => setEliminateOpen(true)}
              disabled={eliminate.isPending}
            >
              Ele
            </Button>
            <Button onClick={handleAward} disabled={award.isPending}>
              Kazandır
            </Button>
          </div>
        ) : null}
      </div>

      {/* Teslim & geçerlilik — ALIM: satıcının taahhüdü; SATIS: alıcının
          İSTEDİĞİ tarih (kesin tarihi satıcı sipariş onayında verir). */}
      <section className="card p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-zinc-500">
              {l.type === "SATIS"
                ? "Alıcının İstediği Teslim"
                : "Taahhüt Edilen Teslim"}
            </dt>
            <dd className="font-medium text-zinc-900">
              {bidDeliveryTimeLabel(bid.deliveryTime) ??
                (bid.deliveryDate
                  ? formatDate(bid.deliveryDate, "short")
                  : "—")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Teklif Geçerliliği</dt>
            <dd className="font-medium text-zinc-900">
              {bid.validityDays ? `${bid.validityDays} gün` : "—"}
            </dd>
          </div>
          {l.type === "SATIS" ? (
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-zinc-500">
                Alıcının Teslimat Adresi
              </dt>
              <dd className="font-medium text-zinc-900">
                {bid.deliveryAddress ? (
                  <>
                    {bid.deliveryAddress.title} —{" "}
                    {bid.deliveryAddress.addressLine}
                    {bid.deliveryAddress.district
                      ? `, ${bid.deliveryAddress.district}`
                      : ""}
                    {bid.deliveryAddress.city
                      ? `, ${bid.deliveryAddress.city}`
                      : ""}
                    {bid.deliveryAddress.contactName
                      ? ` · ${bid.deliveryAddress.contactName}`
                      : ""}
                    {bid.deliveryAddress.phone
                      ? ` · ${bid.deliveryAddress.phone}`
                      : ""}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {/* Kalem kırılımı */}
      {items.length > 0 && bid.items && bid.items.length > 0 ? (
        <section className="space-y-2">
          <Subheading>Kalem Teklifleri</Subheading>
          <div className="card px-2 [--gutter:--spacing(4)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>Kalem</TableHeader>
                  <TableHeader className="text-right">Miktar</TableHeader>
                  <TableHeader className="text-right">Birim Fiyat</TableHeader>
                  <TableHeader className="text-right">Tutar</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((it) => {
                  const bi = bid.items?.find((x) => x.itemId === it.id);
                  const up = bi?.unitPrice;
                  const line = up ? Number(up) * Number(it.quantity) : null;
                  // Kalem sorularının cevapları (satıcı girdiyse).
                  const itemAnswers = (it.questions ?? [])
                    .map((q) => ({
                      q,
                      value: bid.answers?.find((a) => a.questionId === q.id)
                        ?.value,
                    }))
                    .filter((x) => x.value);
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="text-zinc-900">
                        {it.name}
                        {bi?.deliveryTime || bi?.deliveryDate ? (
                          <span className="block text-xs text-zinc-500">
                            {l.type === "SATIS"
                              ? "İstenen kalem teslimi:"
                              : "Kalem teslimi:"}{" "}
                            {bidDeliveryTimeLabel(bi.deliveryTime) ??
                              (bi.deliveryDate
                                ? formatDate(bi.deliveryDate, "short")
                                : "—")}
                          </span>
                        ) : null}
                        {itemAnswers.map(({ q, value }) => (
                          <span
                            key={q.id}
                            className="block text-xs text-zinc-500"
                          >
                            {q.text}: <strong>{value}</strong>
                          </span>
                        ))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-600">
                        {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
                      </TableCell>
                      {/* Madde 9: kalem kendi para birimini taşıyabilir. */}
                      <TableCell className="text-right font-mono tabular-nums text-zinc-700">
                        {up
                          ? formatMoney(up, bi?.currency ?? bid.currency ?? "TRY")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-zinc-900">
                        {line != null
                          ? formatMoney(line, bi?.currency ?? bid.currency ?? "TRY")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {/* Not */}
      {bid.note ? (
        <section className="space-y-2">
          <Subheading>Teklif Notu</Subheading>
          <div className="rounded-xl border border-zinc-950/10 bg-white p-4">
            <Text className="whitespace-pre-wrap text-sm text-zinc-700">
              {bid.note}
            </Text>
          </div>
        </section>
      ) : null}

      {/* Belgeler */}
      <section className="space-y-2">
        <Subheading>Teklif Belgeleri ({docs.length})</Subheading>
        {docs.length === 0 ? (
          <Text className="text-sm text-zinc-500">Belge eklenmemiş.</Text>
        ) : (
          <div className="space-y-4">
            {BID_DOC_KINDS.map((k) => {
              const group = docs.filter((d) => d.kind === k);
              if (group.length === 0) return null;
              return (
                <div key={k} className="space-y-1">
                  <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    {BID_DOC_KIND_LABELS[k]}
                  </p>
                  {group.map((d) => (
                    <a
                      key={d.id}
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-blue-600 hover:bg-zinc-50"
                    >
                      <span aria-hidden="true">📎</span> {d.fileName}
                    </a>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ReasonDialog
        open={eliminateOpen}
        onClose={() => setEliminateOpen(false)}
        onSubmit={submitEliminate}
        title="Teklifi ele"
        description={`"${bid.bidderName}" elensin mi? Yeniden teklif verebilir. Yazdığınız gerekçe ${l.type === "SATIS" ? "alıcıya" : "tedarikçiye"} GÖSTERİLİR.`}
        confirmLabel="Ele"
        destructive
        pending={eliminate.isPending}
      />
    </div>
  );
}
