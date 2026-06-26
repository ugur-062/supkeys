"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Textarea } from "@/components/catalyst/textarea";
import {
  useChangeClosing,
  useCloseEarly,
  useCloseNoAward,
  useUpdateInternalNotes,
} from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { EllipsisVerticalIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  id: string;
  status: string;
  closesAt: string | null;
  internalNotes: string | null;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Alıcının ihale karar menüsü (üç-nokta) — eski header-card aksiyonları. */
export function TenderActionsMenu({ id, status, closesAt, internalNotes }: Props) {
  const closeEarly = useCloseEarly(id);
  const changeClosing = useChangeClosing(id);
  const updateNotes = useUpdateInternalNotes(id);
  const closeNoAward = useCloseNoAward(id);

  const [closingOpen, setClosingOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [newClosing, setNewClosing] = useState(toLocalInput(closesAt));
  const [notes, setNotes] = useState(internalNotes ?? "");

  const isOpen = status === "OPEN";

  const handleCloseEarly = async () => {
    if (!confirm("İhale şimdi kapatılsın mı? Teklif alımı durur, kazandırma aşamasına geçer."))
      return;
    try {
      await closeEarly.mutateAsync();
      toast.success("İhale erken kapatıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kapatılamadı"));
    }
  };

  const handleCloseNoAward = async () => {
    if (!confirm("İhale kazanan olmadan kapatılsın mı? Bu işlem geri alınamaz."))
      return;
    try {
      await closeNoAward.mutateAsync();
      toast.success("İhale kazanan olmadan kapatıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kapatılamadı"));
    }
  };

  const handleChangeClosing = async () => {
    if (!newClosing) {
      toast.error("Tarih seç");
      return;
    }
    try {
      await changeClosing.mutateAsync(new Date(newClosing).toISOString());
      toast.success("Kapanış zamanı güncellendi");
      setClosingOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateNotes.mutateAsync(notes);
      toast.success("Notlar kaydedildi");
      setNotesOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <>
      <Dropdown>
        <DropdownButton outline aria-label="İhale işlemleri">
          <EllipsisVerticalIcon />
        </DropdownButton>
        <DropdownMenu anchor="bottom end">
          <DropdownItem onClick={() => setNotesOpen(true)}>
            <DropdownLabel>İç Notlar</DropdownLabel>
          </DropdownItem>
          {isOpen ? (
            <>
              <DropdownItem onClick={() => setClosingOpen(true)}>
                <DropdownLabel>Kapanış Zamanını Değiştir</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={handleCloseEarly}>
                <DropdownLabel>İhaleyi Erken Kapat</DropdownLabel>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={handleCloseNoAward}>
                <DropdownLabel className="text-red-600">
                  Kazanan Olmadan Kapat
                </DropdownLabel>
              </DropdownItem>
            </>
          ) : null}
        </DropdownMenu>
      </Dropdown>

      {/* Kapanış zamanını değiştir */}
      <Dialog open={closingOpen} onClose={() => setClosingOpen(false)}>
        <DialogTitle>Kapanış Zamanını Değiştir</DialogTitle>
        <DialogDescription>
          Yeni kapanış tarih/saatini seç. İleri alabilir veya öne çekebilirsin.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Kapanış</Label>
            <Input
              type="datetime-local"
              value={newClosing}
              onChange={(e) => setNewClosing(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setClosingOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={handleChangeClosing} disabled={changeClosing.isPending}>
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>

      {/* İç notlar */}
      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)}>
        <DialogTitle>İhale Notları (şirket içi)</DialogTitle>
        <DialogDescription>
          Bu notları sadece firmandaki kullanıcılar görür; tedarikçiler görmez.
        </DialogDescription>
        <DialogBody>
          <Textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
            placeholder="Strateji, hatırlatma, iç değerlendirme…"
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNotesOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={handleSaveNotes} disabled={updateNotes.isPending}>
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
