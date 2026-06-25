"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import {
  useAwardByItem,
  useAwardListing,
  useBuyNow,
  useCancelListing,
  useEliminateBid,
  useListingDetail,
  usePlaceBid,
  useWithdrawBid,
} from "@/hooks/use-company-listings";
import {
  useBidDocuments,
  useDeleteBidDoc,
  useUploadBidDoc,
} from "@/hooks/use-bid-documents";
import { useCategoriesByIds } from "@/hooks/use-categories";
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
  const eliminate = useEliminateBid(id);
  const awardByItem = useAwardByItem(id);
  const categories = useCategoriesByIds(l?.categoryIds ?? []);
  const bidDocs = useBidDocuments(id);
  const uploadBidDoc = useUploadBidDoc(id);
  const deleteBidDoc = useDeleteBidDoc(id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [itemAwardMode, setItemAwardMode] = useState(false);
  const [itemWinners, setItemWinners] = useState<Record<string, string>>({});

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

  const handleEliminate = async (bidId: string, bidderName: string) => {
    if (!confirm(`"${bidderName}" elensin mi? Yeniden teklif verebilir.`)) return;
    try {
      await eliminate.mutateAsync(bidId);
      toast.success("Teklif elendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Elenemedi"));
    }
  };

  // Kalem-bazlı: bir kalem için fiyat veren teklifler (artan sıralı).
  const bidsForItem = (itemId: string) =>
    (l?.bids ?? [])
      .filter((b) => b.status === "SUBMITTED")
      .map((b) => ({
        bidId: b.id,
        bidderName: b.bidderName,
        price: Number(b.items?.find((x) => x.itemId === itemId)?.unitPrice ?? 0),
      }))
      .filter((o) => o.price > 0)
      .sort((a, b) => a.price - b.price);

  const startItemAward = () => {
    const winners: Record<string, string> = {};
    for (const it of l?.items ?? []) {
      const opts = bidsForItem(it.id);
      if (opts[0]) winners[it.id] = opts[0].bidId;
    }
    setItemWinners(winners);
    setItemAwardMode(true);
  };

  const handleAwardByItem = async () => {
    const items = l?.items ?? [];
    const itemAwards = items
      .map((it) => ({ itemId: it.id, bidId: itemWinners[it.id] ?? "" }))
      .filter((a) => a.bidId);
    if (itemAwards.length < items.length) {
      toast.error("Her kalem için kazanan teklif seçin");
      return;
    }
    if (
      !confirm("Kalem-bazlı kazandırılsın mı? Kazanan firma başına sipariş oluşur.")
    )
      return;
    try {
      const res = await awardByItem.mutateAsync(itemAwards);
      toast.success(`Kazandırıldı — ${res.count} sipariş oluştu`);
      setItemAwardMode(false);
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

  const hasItems = (l?.items?.length ?? 0) > 0;
  const itemTotal = (l?.items ?? []).reduce((sum, it) => {
    const up = Number(itemPrices[it.id]);
    return sum + (up > 0 ? up * Number(it.quantity) : 0);
  }, 0);

  const handleBid = async () => {
    try {
      if (hasItems) {
        const items = (l?.items ?? [])
          .map((it) => ({ itemId: it.id, unitPrice: Number(itemPrices[it.id]) }))
          .filter((bi) => bi.unitPrice > 0);
        if (items.length === 0) {
          toast.error("En az bir kaleme birim fiyat girin");
          return;
        }
        if (l?.requireAllItems && items.length < (l?.items?.length ?? 0)) {
          toast.error("Bu ihalede tüm kalemlere fiyat girmelisin");
          return;
        }
        await placeBid.mutateAsync({ items, note: note.trim() || undefined });
      } else {
        const val = Number(amount);
        if (!val || val <= 0) {
          toast.error("Geçerli bir tutar girin");
          return;
        }
        await placeBid.mutateAsync({ amount: val, note: note.trim() || undefined });
      }
      toast.success("Teklifin kaydedildi");
      setNote("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Teklif verilemedi"));
    }
  };

  const handleUploadBidDoc = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await uploadBidDoc.mutateAsync(file);
      toast.success("Belge yüklendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Belge yüklenemedi"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/company"
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

      {/* Kalemler */}
      {l.items && l.items.length > 0 ? (
        <section className="space-y-2">
          <Subheading>Kalemler ({l.items.length})</Subheading>
          <div className="overflow-hidden rounded-xl border border-zinc-950/10">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Kalem</th>
                  <th className="px-3 py-2 text-right font-medium">Miktar</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Hedef Fiyat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {l.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2 text-zinc-400">{it.lineNo}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-900">{it.name}</div>
                      {it.description ? (
                        <div className="text-xs text-zinc-500">
                          {it.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700">
                      {it.targetPrice
                        ? `${Number(it.targetPrice).toLocaleString("tr-TR")} ₺`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* İhale bilgileri */}
      {isAlim &&
      (l.categoryIds?.length ||
        l.keywords?.length ||
        l.terms ||
        l.requireAllItems ||
        l.closesAt) ? (
        <section className="space-y-2 rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-4">
          {categories.data && categories.data.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {categories.data.map((c) => (
                <Badge key={c.id} color="blue">
                  {c.nameTr}
                </Badge>
              ))}
            </div>
          ) : null}
          {l.keywords && l.keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {l.keywords.map((k) => (
                <Badge key={k} color="zinc">
                  {k}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            {l.primaryCurrency ? (
              <span>
                Para birimi:{" "}
                <strong className="text-zinc-700">
                  {l.allowedCurrencies?.length
                    ? l.allowedCurrencies.join(", ")
                    : l.primaryCurrency}
                </strong>
              </span>
            ) : null}
            {l.requireAllItems ? <span>· Tüm kalemlere teklif zorunlu</span> : null}
            {l.requireBidDocument ? <span>· Belge zorunlu</span> : null}
            {l.closesAt ? (
              <span>
                · Kapanış: {new Date(l.closesAt).toLocaleString("tr-TR")}
              </span>
            ) : null}
          </div>
          {l.terms ? (
            <Text className="whitespace-pre-wrap text-xs text-zinc-600">
              {l.terms}
            </Text>
          ) : null}
        </section>
      ) : null}

      {/* Davetli tedarikçiler (sahip) */}
      {l.isOwner && l.invitations && l.invitations.length > 0 ? (
        <section className="space-y-2">
          <Subheading>Davetli Tedarikçiler ({l.invitations.length})</Subheading>
          <div className="flex flex-wrap gap-2">
            {l.invitations.map((iv) => (
              <span
                key={iv.supkeysId ?? iv.companyName}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
              >
                {iv.companyName}{" "}
                <span className="font-mono text-xs text-zinc-400">
                  {iv.supkeysId}
                </span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

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
          {/* Kalem-bazlı karşılaştırma — her kalemde en düşük yeşil */}
          {l.items &&
          l.items.length > 0 &&
          l.bids &&
          l.bids.some((b) => b.items && b.items.length > 0) ? (
            <div className="space-y-2">
              <Subheading>Kalem Karşılaştırma</Subheading>
              <div className="overflow-x-auto rounded-xl border border-zinc-950/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Kalem</th>
                      {l.bids.map((b) => (
                        <th
                          key={b.id}
                          className="px-3 py-2 text-right font-medium whitespace-nowrap"
                        >
                          {b.bidderName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {l.items.map((it) => {
                      const prices = (l.bids ?? []).map((b) => {
                        const bi = b.items?.find((x) => x.itemId === it.id);
                        return bi ? Number(bi.unitPrice) : null;
                      });
                      const valid = prices.filter(
                        (p): p is number => p != null && p > 0,
                      );
                      const min = valid.length ? Math.min(...valid) : null;
                      return (
                        <tr key={it.id}>
                          <td className="px-3 py-2 text-zinc-900 whitespace-nowrap">
                            {it.name}{" "}
                            <span className="text-xs text-zinc-400">
                              ({Number(it.quantity).toLocaleString("tr-TR")}{" "}
                              {it.unit})
                            </span>
                          </td>
                          {prices.map((p, bi) => (
                            <td
                              key={bi}
                              className={`px-3 py-2 text-right font-mono whitespace-nowrap ${
                                p != null && p === min
                                  ? "bg-emerald-50 font-semibold text-emerald-700"
                                  : "text-zinc-600"
                              }`}
                            >
                              {p != null
                                ? `${p.toLocaleString("tr-TR")} ₺`
                                : "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Kalem-bazlı kazandırma */}
          {l.status === "OPEN" &&
          l.items &&
          l.items.length > 0 &&
          l.bids &&
          l.bids.some((b) => b.items && b.items.length > 0) ? (
            itemAwardMode ? (
              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <Subheading>Kalem-bazlı Kazandırma</Subheading>
                <Text className="text-xs text-zinc-500">
                  Her kalem için kazanan teklifi seç. Kazanan firma başına ayrı
                  sipariş oluşur.
                </Text>
                <div className="space-y-2">
                  {l.items.map((it) => {
                    const opts = bidsForItem(it.id);
                    return (
                      <div
                        key={it.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-zinc-900">{it.name}</span>
                        <select
                          value={itemWinners[it.id] ?? ""}
                          onChange={(e) =>
                            setItemWinners((w) => ({
                              ...w,
                              [it.id]: e.target.value,
                            }))
                          }
                          className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        >
                          <option value="">— seç —</option>
                          {opts.map((o) => (
                            <option key={o.bidId} value={o.bidId}>
                              {o.bidderName} · {o.price.toLocaleString("tr-TR")} ₺
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2">
                  <Button plain onClick={() => setItemAwardMode(false)}>
                    Vazgeç
                  </Button>
                  <Button
                    onClick={handleAwardByItem}
                    disabled={awardByItem.isPending}
                  >
                    Onayla & Kazandır
                  </Button>
                </div>
              </div>
            ) : (
              <Button outline onClick={startItemAward}>
                Kalem-bazlı Kazandır
              </Button>
            )
          ) : null}

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
                    {(bidDocs.data ?? [])
                      .filter((d) => d.bidId === b.id)
                      .map((d) => (
                        <a
                          key={d.id}
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          title={d.fileName}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-blue-600 hover:underline"
                        >
                          📎{" "}
                          {d.fileName.length > 18
                            ? `${d.fileName.slice(0, 16)}…`
                            : d.fileName}
                        </a>
                      ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-zinc-900">
                      {Number(b.amount).toLocaleString("tr-TR")} ₺
                    </span>
                    {l.status === "OPEN" && b.status === "SUBMITTED" ? (
                      <>
                        <Button
                          plain
                          onClick={() => handleEliminate(b.id, b.bidderName)}
                          disabled={eliminate.isPending}
                        >
                          Ele
                        </Button>
                        <Button
                          onClick={() => handleAward(b.id, b.bidderName)}
                          disabled={award.isPending}
                        >
                          Kazandır
                        </Button>
                      </>
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
              {hasItems ? (
                <div className="space-y-2">
                  <Label>Kalem teklifleri (birim fiyat)</Label>
                  <div className="overflow-hidden rounded-lg border border-zinc-200">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-xs text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">
                            Kalem
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Miktar
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Birim Fiyat
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Tutar
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {(l.items ?? []).map((it) => {
                          const up = Number(itemPrices[it.id]);
                          const line = up > 0 ? up * Number(it.quantity) : 0;
                          return (
                            <tr key={it.id}>
                              <td className="px-3 py-2 text-zinc-900">
                                {it.name}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-500">
                                {Number(it.quantity).toLocaleString("tr-TR")}{" "}
                                {it.unit}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm"
                                  value={itemPrices[it.id] ?? ""}
                                  onChange={(e) =>
                                    setItemPrices((p) => ({
                                      ...p,
                                      [it.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-zinc-700">
                                {line > 0
                                  ? `${line.toLocaleString("tr-TR")} ₺`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-zinc-50">
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-2 text-right text-xs font-semibold text-zinc-500"
                          >
                            Toplam
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                            {itemTotal.toLocaleString("tr-TR")} ₺
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {l.requireAllItems ? (
                    <Text className="text-xs text-amber-600">
                      Bu ihalede tüm kalemlere fiyat girmen gerekiyor.
                    </Text>
                  ) : null}
                </div>
              ) : (
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
              )}
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

              {l.myBid ? (
                <div className="space-y-2 border-t border-zinc-100 pt-3">
                  <div className="flex items-center justify-between">
                    <Label>
                      Teklif Belgeleri
                      {l.requireBidDocument ? " (zorunlu)" : ""}
                    </Label>
                    <label className="cursor-pointer text-xs font-medium text-blue-600 hover:underline">
                      {uploadBidDoc.isPending ? "Yükleniyor…" : "+ Belge Ekle"}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
                        onChange={handleUploadBidDoc}
                        disabled={uploadBidDoc.isPending}
                      />
                    </label>
                  </div>
                  {(bidDocs.data ?? []).filter((d) => d.mine).length === 0 ? (
                    <Text className="text-xs text-zinc-400">
                      {l.requireBidDocument
                        ? "Bu ihale belge zorunlu — kazanabilmek için en az bir dosya ekle."
                        : "Henüz belge eklemedin."}
                    </Text>
                  ) : (
                    <div className="space-y-1">
                      {(bidDocs.data ?? [])
                        .filter((d) => d.mine)
                        .map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs"
                          >
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-blue-600 hover:underline"
                            >
                              {d.fileName}
                            </a>
                            <button
                              type="button"
                              onClick={() => deleteBidDoc.mutate(d.id)}
                              className="shrink-0 text-zinc-400 hover:text-red-600"
                            >
                              Sil
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ) : null}
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
