"use client";

import { Button } from "@/components/catalyst/button";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { StarRating, ratingLabel } from "@/components/ui/star-rating";
import { useOrderReview, useUpsertReview } from "@/hooks/use-company-orders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function OrderReviewCard({
  orderId,
  targetName,
  title = "Tedarikçi Değerlendirme",
}: {
  orderId: string;
  targetName: string;
  title?: string;
}) {
  const { data: existing } = useOrderReview(orderId, true);
  const upsert = useUpsertReview(orderId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (existing) {
      setRating(existing.rating);
      setComment(existing.comment ?? "");
    }
  }, [existing]);

  const save = async () => {
    if (rating < 1) {
      toast.error("Lütfen 1-5 arası puan verin");
      return;
    }
    try {
      await upsert.mutateAsync({ rating, comment: comment.trim() || undefined });
      toast.success("Değerlendirmeniz kaydedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
      <Subheading>{title}</Subheading>
      <Text className="mt-0.5 text-sm text-zinc-500">
        {targetName} ile bu siparişteki deneyiminizi puanlayın. Puan, firmanın
        profilinde ortalamaya katılır.
      </Text>

      {/* P2 (denetim §9 Rating): SVG yıldız + radiogroup + sözlü etiket;
          0 yıldızla gönderim pasif. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StarRating value={rating} onChange={setRating} />
        {rating > 0 ? (
          <span className="text-sm text-zinc-500">
            {rating} / 5 — {ratingLabel(rating)}
          </span>
        ) : null}
      </div>

      <Textarea
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        placeholder="Yorumunuz (opsiyonel)…"
        className="mt-3"
      />
      <p className="mt-1 text-right text-xs text-zinc-400">
        {comment.length}/2000
      </p>

      <div className="mt-3 flex justify-end">
        <Button onClick={save} disabled={upsert.isPending || rating < 1}>
          {existing ? "Değerlendirmeyi Güncelle" : "Değerlendir"}
        </Button>
      </div>
    </section>
  );
}
