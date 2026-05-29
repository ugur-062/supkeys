"use client";

import { Button } from "@/components/ui/button";
import {
  useDeleteOrderReview,
  useOwnOrderReview,
  useUpsertOrderReview,
} from "@/hooks/use-supplier-reviews";
import { cn } from "@/lib/utils";
import axios from "axios";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  orderId: string;
  supplierName: string;
}

/**
 * V2-REVIEWS — Sipariş detayında "Tedarikçiyi Değerlendir" kartı.
 * Order COMPLETED değilse hiçbir şey render etmez.
 */
export function ReviewCard({ orderId, supplierName }: Props) {
  const { data, isLoading } = useOwnOrderReview(orderId);

  if (isLoading || !data) return null;
  if (!data.canReview) return null; // COMPLETED değil → kart yok

  return (
    <div className="bg-white border border-surface-border rounded-2xl shadow-card p-5 md:p-6">
      {data.review ? (
        <ExistingReviewView
          orderId={orderId}
          review={data.review}
          canEdit={data.canEdit}
          supplierName={supplierName}
        />
      ) : (
        <NewReviewForm orderId={orderId} supplierName={supplierName} />
      )}
    </div>
  );
}

// ============================================================
// Mevcut review görüntüsü + Düzenle / Sil aksiyonları
// ============================================================

function ExistingReviewView({
  orderId,
  review,
  canEdit,
  supplierName,
}: {
  orderId: string;
  review: NonNullable<
    ReturnType<typeof useOwnOrderReview>["data"]
  >["review"] & object;
  canEdit: boolean;
  supplierName: string;
}) {
  const [editing, setEditing] = useState(false);
  const remove = useDeleteOrderReview(orderId);

  if (editing) {
    return (
      <ReviewForm
        orderId={orderId}
        supplierName={supplierName}
        initial={{
          rating: review.rating,
          reviewText: review.reviewText ?? "",
          isPublic: review.isPublic,
        }}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const onDelete = async () => {
    if (
      !window.confirm("Değerlendirmenizi silmek istediğinize emin misiniz?")
    )
      return;
    try {
      await remove.mutateAsync();
      toast.success("Değerlendirme silindi");
    } catch (err) {
      toast.error(extractError(err, "Silme başarısız"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-bold text-brand-900">
            Değerlendirmeniz
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {format(new Date(review.createdAt), "d MMMM yyyy", { locale: tr })}
            {!review.isPublic ? " · Yalnızca yıldız sayılır" : ""}
          </p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" /> Düzenle
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Sil
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-500">
            30 günlük düzenleme süresi geçti
          </span>
        )}
      </div>
      <StarRow value={review.rating} readOnly />
      {review.reviewText ? (
        <p className="text-sm text-slate-700 whitespace-pre-line">
          {review.reviewText}
        </p>
      ) : null}
    </div>
  );
}

// ============================================================
// Yeni review formu — CTA görünümü
// ============================================================

function NewReviewForm({
  orderId,
  supplierName,
}: {
  orderId: string;
  supplierName: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-bold text-brand-900">
            Tedarikçiyi Değerlendir
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            {supplierName} ile bu sipariş deneyiminizi paylaşın. Yıldızlar
            ve isteğe bağlı yorum diğer alıcılara yardımcı olur.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setOpen(true)}>
          <Star className="h-4 w-4" />
          Değerlendir
        </Button>
      </div>
    );
  }

  return (
    <ReviewForm
      orderId={orderId}
      supplierName={supplierName}
      initial={{ rating: 0, reviewText: "", isPublic: true }}
      onDone={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}

// ============================================================
// Ortak form (create + update)
// ============================================================

function ReviewForm({
  orderId,
  supplierName,
  initial,
  onDone,
  onCancel,
}: {
  orderId: string;
  supplierName: string;
  initial: { rating: number; reviewText: string; isPublic: boolean };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(initial.rating);
  const [reviewText, setReviewText] = useState(initial.reviewText);
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const upsert = useUpsertOrderReview(orderId);

  useEffect(() => {
    setRating(initial.rating);
    setReviewText(initial.reviewText);
    setIsPublic(initial.isPublic);
  }, [initial.rating, initial.reviewText, initial.isPublic]);

  const submit = async () => {
    if (rating < 1) {
      toast.error("Lütfen yıldız puanı verin");
      return;
    }
    try {
      await upsert.mutateAsync({
        rating,
        reviewText: reviewText.trim() || undefined,
        isPublic,
      });
      toast.success("Değerlendirme kaydedildi");
      onDone();
    } catch (err) {
      toast.error(extractError(err, "Kaydetme başarısız"));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display font-bold text-brand-900">
          {initial.rating > 0 ? "Değerlendirmeyi Düzenle" : "Tedarikçiyi Değerlendir"}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{supplierName}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-brand-900">Yıldız puanı</p>
        <StarRow value={rating} onChange={setRating} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-brand-900" htmlFor="reviewText">
          Yorumunuz (opsiyonel)
        </label>
        <textarea
          id="reviewText"
          rows={4}
          maxLength={2000}
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Sipariş deneyiminizi anlatın. Kalite, iletişim, teslimat süresi..."
          className="w-full px-3 py-2 text-sm rounded-lg border border-surface-border focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none resize-y"
        />
        <p className="text-xs text-slate-400 text-right">
          {reviewText.length}/2000
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-brand-900 cursor-pointer">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          Yorumum tedarikçinin herkese açık profilinde görünsün
        </span>
      </label>
      {!isPublic ? (
        <p className="text-xs text-slate-500 -mt-2">
          Kapalıyken yıldızınız ortalama hesabına katılır ama yorum metniniz
          gizli kalır.
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
        <Button type="button" variant="secondary" onClick={onCancel}>
          İptal
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={submit}
          disabled={upsert.isPending}
        >
          {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Kaydet
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Etkileşimli yıldız satırı (1-5)
// ============================================================

function StarRow({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange?: (n: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-0.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n;
        const Tag = readOnly ? "span" : "button";
        return (
          <Tag
            key={n}
            type={readOnly ? undefined : "button"}
            role={readOnly ? undefined : "radio"}
            aria-checked={readOnly ? undefined : filled}
            aria-label={readOnly ? undefined : `${n} yıldız`}
            onClick={readOnly ? undefined : () => onChange?.(n)}
            className={cn(
              "p-0.5 rounded transition-colors",
              !readOnly && "hover:scale-110 cursor-pointer",
            )}
          >
            <Star
              className={cn(
                "h-6 w-6",
                filled
                  ? "fill-yellow-400 text-yellow-500"
                  : "text-slate-300",
              )}
            />
          </Tag>
        );
      })}
    </div>
  );
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] };
    const m = data?.message;
    if (Array.isArray(m)) return m.join(", ");
    if (m) return m;
  }
  return fallback;
}
