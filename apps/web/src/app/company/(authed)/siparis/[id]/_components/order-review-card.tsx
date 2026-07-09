"use client";

import { Button } from "@/components/catalyst/button";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
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
  const [hover, setHover] = useState(0);
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

      <div className="mt-3 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={`text-3xl leading-none transition ${
              (hover || rating) >= n ? "text-amber-500" : "text-zinc-300"
            }`}
            aria-label={`${n} yıldız`}
          >
            ★
          </button>
        ))}
        {rating > 0 ? (
          <span className="ml-2 text-sm text-zinc-500">{rating}/5</span>
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

      <div className="mt-3 flex justify-end">
        <Button onClick={save} disabled={upsert.isPending}>
          {existing ? "Değerlendirmeyi Güncelle" : "Değerlendir"}
        </Button>
      </div>
    </section>
  );
}
