"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Textarea } from "@/components/catalyst/textarea";
import {
  useCreateListing,
  type ListingFormat,
  type ListingType,
  type ListingVisibility,
} from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useState } from "react";
import { toast } from "sonner";

/** Seçim kartı — tek panelde tekrar tekrar kullanılır. */
function Choice({
  active,
  onClick,
  title,
  desc,
  color = "zinc",
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  color?: "zinc" | "blue" | "emerald";
}) {
  const activeBorder =
    color === "blue"
      ? "border-blue-500 bg-blue-50"
      : color === "emerald"
        ? "border-emerald-500 bg-emerald-50"
        : "border-zinc-800 bg-zinc-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition ${
        active ? activeBorder : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <div className="text-sm font-semibold text-zinc-900">{title}</div>
      <div className="mt-1 text-xs text-zinc-500">{desc}</div>
    </button>
  );
}

export function NewListingDialog({
  open,
  onClose,
  fixedType,
}: {
  open: boolean;
  onClose: () => void;
  /** Portal bağlamında tür sabit (ihalelerim → ALIM, satış ilanlarım → SATIS). */
  fixedType?: ListingType;
}) {
  const create = useCreateListing();
  const [isInternational, setIsInternational] = useState(false);
  const [type, setType] = useState<ListingType>(fixedType ?? "ALIM");
  const [format, setFormat] = useState<ListingFormat>("RFQ");
  const [minPrice, setMinPrice] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [visibility, setVisibility] = useState<ListingVisibility>("CONNECTIONS");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const titleOk = title.trim().length >= 3;
  const saleOk = type === "SATIS" ? Number(minPrice) > 0 : true;
  const canSave = titleOk && saleOk;

  const reset = () => {
    setIsInternational(false);
    setType(fixedType ?? "ALIM");
    setFormat("RFQ");
    setMinPrice("");
    setBuyNowPrice("");
    setVisibility("CONNECTIONS");
    setTitle("");
    setDescription("");
  };

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await create.mutateAsync({
        type,
        isInternational,
        format: type === "ALIM" ? format : undefined,
        minPrice: type === "SATIS" ? Number(minPrice) : undefined,
        buyNowPrice:
          type === "SATIS" && Number(buyNowPrice) > 0
            ? Number(buyNowPrice)
            : undefined,
        visibility,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      toast.success("İlan oluşturuldu");
      reset();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "İlan oluşturulamadı"));
    }
  };

  return (
    <Dialog open={open} onClose={() => !create.isPending && onClose()} size="lg">
      <DialogTitle>Yeni İlan</DialogTitle>
      <DialogBody className="space-y-6">
        {/* 1. Kapsam */}
        <div>
          <Label>1 · Kapsam</Label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Choice
              active={!isInternational}
              onClick={() => setIsInternational(false)}
              title="🇹🇷 Yurtiçi"
              desc="Aynı ülkedeki firmalar"
            />
            <Choice
              active={isInternational}
              onClick={() => setIsInternational(true)}
              title="🌍 Uluslararası"
              desc="Yurtdışındaki firmalar"
            />
          </div>
        </div>

        {/* 2. Tür — portal bağlamında sabitse gizle */}
        {fixedType ? null : (
          <div>
            <Label>2 · Tür</Label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Choice
                active={type === "ALIM"}
                onClick={() => setType("ALIM")}
                title="🔵 Alım"
                desc="Almak istiyorum — satıcılar teklif verir"
                color="blue"
              />
              <Choice
                active={type === "SATIS"}
                onClick={() => setType("SATIS")}
                title="🟢 Satış"
                desc="Satmak istiyorum — alıcılar teklif verir"
                color="emerald"
              />
            </div>
          </div>
        )}

        {/* 3a. Alış → format */}
        {type === "ALIM" ? (
          <div>
            <Label>3 · Format</Label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Choice
                active={format === "RFQ"}
                onClick={() => setFormat("RFQ")}
                title="RFQ (Teklif Toplama)"
                desc="Kapalı zarf — süre dolunca karşılaştır"
              />
              <Choice
                active={format === "ENGLISH_AUCTION"}
                onClick={() => setFormat("ENGLISH_AUCTION")}
                title="İngiliz Usulü"
                desc="Açık eksiltme — fiyat düşerek yarışır"
              />
            </div>
          </div>
        ) : (
          /* 3b. Satış → fiyatlar */
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>3 · Taban (min) fiyat ₺ *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Ör. 50000"
              />
            </Field>
            <Field>
              <Label>Hemen-Al fiyatı ₺ (ops.)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={buyNowPrice}
                onChange={(e) => setBuyNowPrice(e.target.value)}
                placeholder="Ör. 80000"
              />
            </Field>
          </div>
        )}

        {/* 4. Detay */}
        <div className="space-y-4 border-t border-zinc-100 pt-4">
          <Label>4 · Detay</Label>
          <Field>
            <Label>Başlık</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Ör. 50 ton soğuk haddelenmiş çelik"
            />
          </Field>
          <Field>
            <Label>Açıklama (opsiyonel)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </Field>
          <div>
            <Label>Kimler görsün?</Label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Choice
                active={visibility === "CONNECTIONS"}
                onClick={() => setVisibility("CONNECTIONS")}
                title="Bağlantılarım"
                desc="Sadece bağlı firmalar"
              />
              <Choice
                active={visibility === "PUBLIC"}
                onClick={() => setVisibility("PUBLIC")}
                title="Herkese açık"
                desc="Herkes görür; standart firma adını göremez"
              />
            </div>
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={create.isPending}>
          Vazgeç
        </Button>
        <Button onClick={handleSave} disabled={!canSave || create.isPending}>
          {create.isPending ? "Oluşturuluyor…" : "İlanı Oluştur"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
