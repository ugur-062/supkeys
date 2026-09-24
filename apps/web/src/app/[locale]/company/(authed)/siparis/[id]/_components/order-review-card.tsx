"use client";

import { useTranslations } from "next-intl";
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
  ratee = "supplier",
}: {
  orderId: string;
  targetName: string;
  /** Puanlanan taraf: alıcı satıcıyı ("supplier"), satıcı alıcıyı ("buyer") değerlendirir —
   *  başlık ve anonim rol sözcüğü bundan türer (eskiden Türkçe başlığa `includes` ile bakılıyordu). */
  ratee?: "buyer" | "supplier";
}) {
  const t = useTranslations("web.panel.trade.orderReviewCard");
  const title = ratee === "buyer" ? t("musteriDegerlendirme") : t("tedarikciDegerlendirme");
  const { data: existing } = useOrderReview(orderId, true);
  const upsert = useUpsertReview(orderId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  // Opt-in referans (2026-08-22): varsayılan KAPALI — profilde "Doğrulanmış
  // alıcı/tedarikçi" olarak anonim görünür; açılırsa platform-içi profilde
  // firma adı görünür (herkese açık sayfada asla).
  const [showName, setShowName] = useState(false);

  useEffect(() => {
    if (existing) {
      setRating(existing.rating);
      setComment(existing.comment ?? "");
      setShowName(existing.showName ?? false);
    }
  }, [existing]);

  const save = async () => {
    if (rating < 1) {
      toast.error(t("lutfen15ArasiPuan"));
      return;
    }
    try {
      await upsert.mutateAsync({ rating, comment: comment.trim() || undefined, showName });
      toast.success(t("degerlendirmenizKaydedildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  return (
    <section className="card p-5">
      <Subheading>{title}</Subheading>
      <Text className="mt-0.5 text-sm text-zinc-500">
        {t("ileBuSiparistekiDeneyiminiziPuanlayin", { targetName: targetName })}
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
        placeholder={t("yorumunuzOpsiyonel")}
        className="mt-3"
      />
      <p className="mt-1 text-right text-xs text-zinc-400">
        {comment.length}/2000
      </p>

      <label className="mt-2 flex items-start gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={showName}
          onChange={(e) => setShowName(e.target.checked)}
        />
        <span>
          {t("firmaAdimReferansOlarakGorunsun")}
          <span className="block text-xs text-zinc-500">
            {t("kapaliykenDogrulanmisOlarakAnonimGorunursunuz", {
              role: ratee === "supplier" ? t("alici") : t("tedarikci"),
            })}
          </span>
        </span>
      </label>

      <div className="mt-3 flex justify-end">
        <Button onClick={save} disabled={upsert.isPending || rating < 1}>
          {existing ? t("degerlendirmeyiGuncelle") : t("degerlendir")}
        </Button>
      </div>
    </section>
  );
}
