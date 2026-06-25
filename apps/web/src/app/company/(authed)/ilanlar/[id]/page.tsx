"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import {
  useAwardListing,
  useBuyNow,
  useCancelListing,
  useListingDetail,
  usePlaceBid,
  useWithdrawBid,
} from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: l, isLoading } = useListingDetail(id);
  const placeBid = usePlaceBid(id);
  const award = useAwardListing(id);
  const buyNow = useBuyNow(id);
  const cancelListing = useCancelListing(id);
  const withdrawBid = useWithdrawBid(id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const handleCancel = async () => {
    if (!confirm("İlan iptal edilsin mi? Bu işlem geri alınamaz.")) return;
    try {
      await cancelListing.mutateAsync();
      toast.success("İlan iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal edilemedi"));
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdrawBid.mutateAsync();
      toast.success("Teklifin geri çekildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Geri çekilemedi"));
    }
  };

  const handleBuyNow = async () => {
    try {
      await buyNow.mutateAsync();
      toast.success("Hemen-Al teklifin gönderildi — satıcı onayı bekleniyor");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Hemen-Al başarısız"));
    }
  };

  const handleAward = async (bidId: string, bidderName: string) => {
    if (!confirm(`"${bidderName}" kazandırılsın mı? Sipariş oluşacak.`)) return;
    try {
      const res = await award.mutateAsync(bidId);
      toast.success(`Kazandırıldı — sipariş ${res.number} oluştu`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kazandırılamadı"));
    }
  };

  if (isLoading) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }
  if (!l) {
    return (
      <div className="mx-auto max-w-3xl">
        <Text className="text-sm text-zinc-500">İlan bulunamadı.</Text>
      </div>
    );
  }

  const isAlim = l.type === "ALIM";
  const directionHint = isAlim
    ? "Alım ilanı — en düşük teklif kazanır."
    : "Satış ilanı — en yüksek teklif kazanır.";

  const handleBid = async () => {
    const val = Number(amount);
    if (!val || val <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    try {
      await placeBid.mutateAsync({ amount: val, note: note.trim() || undefined });
      toast.success("Teklifin kaydedildi");
      setNote("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Teklif verilemedi"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/company/ilanlar"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        İlanlar
      </Link>

      {/* Başlık */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={isAlim ? "blue" : "emerald"}>
            {isAlim ? "🔵 Alım" : "🟢 Satış"}
          </Badge>
          <Badge color="zinc">
            {l.isInternational ? "🌍 Uluslararası" : "🇹🇷 Yurtiçi"}
          </Badge>
          {isAlim && l.format ? (
            <Badge color="purple">
              {l.format === "RFQ" ? "RFQ" : "İngiliz Usulü"}
            </Badge>
          ) : null}
          <Badge color="zinc">{l.status === "OPEN" ? "Açık" : l.status}</Badge>
          <span className="font-mono text-xs text-zinc-500">{l.number}</span>
        </div>
        <Heading>{l.title}</Heading>
        <Text className="text-sm">
          {l.owner ? l.owner.name : "🔒 Gizli firma"} · {directionHint}
        </Text>
        {!isAlim && l.minPrice ? (
          <Text className="text-sm text-zinc-600">
            Taban: <strong>{Number(l.minPrice).toLocaleString("tr-TR")} ₺</strong>
            {l.buyNowPrice
              ? ` · Hemen-Al: ${Number(l.buyNowPrice).toLocaleString("tr-TR")} ₺`
              : ""}
          </Text>
        ) : null}
        {l.description ? (
          <Text className="whitespace-pre-wrap text-sm text-zinc-600">
            {l.description}
          </Text>
        ) : null}
      </div>

      {/* SAHİP: gelen teklifler */}
      {l.isOwner ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Subheading>Gelen Teklifler ({l.bids?.length ?? 0})</Subheading>
            {l.status === "OPEN" ? (
              <Button
                plain
                onClick={handleCancel}
                disabled={cancelListing.isPending}
              >
                İlanı İptal Et
              </Button>
            ) : null}
          </div>
          {!l.bids || l.bids.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
              <Text className="text-sm text-zinc-500">Henüz teklif yok.</Text>
            </div>
          ) : (
            <div className="space-y-2">
              {l.bids.map((b, i) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {i === 0 && l.status === "OPEN" ? (
                      <Badge color="green">En iyi</Badge>
                    ) : null}
                    {b.status === "WON" ? (
                      <Badge color="green">Kazandı</Badge>
                    ) : null}
                    {b.status === "LOST" ? (
                      <Badge color="zinc">Elendi</Badge>
                    ) : null}
                    {b.isBuyNow ? (
                      <Badge color="emerald">Hemen-Al</Badge>
                    ) : null}
                    <span className="text-sm font-medium text-zinc-900">
                      {b.bidderName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-zinc-900">
                      {Number(b.amount).toLocaleString("tr-TR")} ₺
                    </span>
                    {l.status === "OPEN" ? (
                      <Button
                        onClick={() => handleAward(b.id, b.bidderName)}
                        disabled={award.isPending}
                      >
                        Kazandır
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              <Text className="text-xs text-zinc-400">
                Kazandırınca sipariş oluşur (Siparişler'de görünür).
              </Text>
            </div>
          )}
        </section>
      ) : (
        /* SAHİP DEĞİL: teklif ver */
        <section className="space-y-3">
          <Subheading>Teklif Ver</Subheading>
          {l.canBid ? (
            <div className="space-y-4 rounded-xl border border-zinc-950/10 bg-white p-5">
              {l.english?.isEnglishAuction ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-amber-700">
                      Açık eksiltme · güncel en düşük
                    </div>
                    <div className="text-lg font-bold text-amber-900">
                      {l.english.currentBest
                        ? `${Number(l.english.currentBest).toLocaleString("tr-TR")} ₺`
                        : "Henüz teklif yok"}
                    </div>
                  </div>
                  <div className="text-right text-xs text-amber-700">
                    {l.english.bidCount} teklif
                    {l.english.currentBest ? (
                      <div className="mt-0.5">altında teklif ver</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {!isAlim && l.buyNowPrice ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-emerald-900">
                      Hemen Al — {Number(l.buyNowPrice).toLocaleString("tr-TR")} ₺
                    </div>
                    <div className="text-xs text-emerald-700">
                      Tavan fiyattan teklif ver. Satıcı yine de onaylar.
                    </div>
                  </div>
                  <Button onClick={handleBuyNow} disabled={buyNow.isPending}>
                    Hemen Al
                  </Button>
                </div>
              ) : null}
              {l.myBid ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2">
                  <Text className="text-sm">
                    Mevcut teklifin:{" "}
                    <strong>
                      {Number(l.myBid.amount).toLocaleString("tr-TR")} ₺
                    </strong>
                  </Text>
                  {l.myBid.status === "SUBMITTED" ? (
                    <Button
                      plain
                      onClick={handleWithdraw}
                      disabled={withdrawBid.isPending}
                    >
                      Geri Çek
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <Field>
                <Label>Tutar (₺)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={l.myBid ? l.myBid.amount : "Ör. 50000"}
                />
              </Field>
              <Field>
                <Label>Not (opsiyonel)</Label>
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                />
              </Field>
              <Button onClick={handleBid} disabled={placeBid.isPending}>
                {placeBid.isPending
                  ? "Gönderiliyor…"
                  : l.myBid
                    ? "Teklifimi Güncelle"
                    : "Teklif Ver"}
              </Button>
              <Text className="text-xs text-zinc-400">
                {l.english?.isEnglishAuction
                  ? "Açık eksiltme: teklifin güncel en düşüğün altında olmalı; tutarlar herkese açık."
                  : "Kapalı zarf: diğer tekliflerin tutarını göremezsin."}
              </Text>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <Text className="text-sm text-amber-800">
                Bu ilana teklif vermek için <strong>premium üyelik</strong>{" "}
                gerekir (veya ilanı açan firmayla bağlantı kur).
              </Text>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
