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
  type ListingType,
  type ListingVisibility,
} from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useState } from "react";
import { toast } from "sonner";

export function NewListingDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateListing();
  const [type, setType] = useState<ListingType>("ALIM");
  const [visibility, setVisibility] = useState<ListingVisibility>("CONNECTIONS");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const canSave = title.trim().length >= 3;

  const reset = () => {
    setType("ALIM");
    setVisibility("CONNECTIONS");
    setTitle("");
    setDescription("");
  };

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await create.mutateAsync({
        type,
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
      <DialogBody className="space-y-5">
        {/* Tip seçimi */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setType("ALIM")}
            className={`rounded-xl border-2 p-4 text-left transition ${
              type === "ALIM"
                ? "border-blue-500 bg-blue-50"
                : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <div className="text-sm font-semibold text-zinc-900">🔵 Alım</div>
            <div className="mt-1 text-xs text-zinc-500">
              Bir şey almak istiyorum — satıcılar teklif verir, en ucuz kazanır.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setType("SATIS")}
            className={`rounded-xl border-2 p-4 text-left transition ${
              type === "SATIS"
                ? "border-emerald-500 bg-emerald-50"
                : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <div className="text-sm font-semibold text-zinc-900">🟢 Satış</div>
            <div className="mt-1 text-xs text-zinc-500">
              Elimdekini satmak — alıcılar teklif verir, en yüksek kazanır.
            </div>
          </button>
        </div>

        <Field>
          <Label>Başlık</Label>
          <Input
            autoFocus
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
            rows={4}
            maxLength={5000}
            placeholder="Detaylar, şartlar…"
          />
        </Field>

        {/* Görünürlük */}
        <div>
          <Label>Kimler görsün?</Label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setVisibility("CONNECTIONS")}
              className={`rounded-xl border-2 p-3 text-left transition ${
                visibility === "CONNECTIONS"
                  ? "border-zinc-800 bg-zinc-50"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <div className="text-sm font-semibold text-zinc-900">
                Bağlantılarım
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Sadece bağlı olduğun firmalar görür.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setVisibility("PUBLIC")}
              className={`rounded-xl border-2 p-3 text-left transition ${
                visibility === "PUBLIC"
                  ? "border-zinc-800 bg-zinc-50"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <div className="text-sm font-semibold text-zinc-900">
                Herkese açık
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Herkes görür; standart üyeler firma adını göremez.
              </div>
            </button>
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={create.isPending}>
          Vazgeç
        </Button>
        <Button onClick={handleSave} disabled={!canSave || create.isPending}>
          {create.isPending ? "Oluşturuluyor…" : "Oluştur"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
