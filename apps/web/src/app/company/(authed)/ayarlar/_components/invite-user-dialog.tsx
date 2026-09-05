"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { PermissionTable } from "@/components/company/permission-table";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useInviteUser,
  usePermissionCatalog,
  useSeats,
} from "@/hooks/use-company-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Token'lı davet — e-posta + YETKİ TABLOSU (Faz 4): davetli hangi tiklerle
 * katılacaksa burada işaretlenir; hazır set çipleri (Satın Almacı varsayılan)
 * tabloyu doldurur. Davetli, e-postadaki linkten adını/parolasını KENDİSİ
 * belirleyip sözleşmeleri onaylayarak katılır.
 */
export function InviteUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const invite = useInviteUser();
  const { user: viewer } = useCompanyAuth();
  const { data: catalog } = usePermissionCatalog();
  // Faz K: koltuk doluysa işlem tikleri kilitli (UX — asıl kapı backend).
  const { data: seats } = useSeats();
  const seatsFull =
    seats?.limit != null && seats.used + seats.pendingSeatInvites >= seats.limit;
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  // Katalog gelince varsayılan hazır set: Satın Almacı.
  useEffect(() => {
    if (catalog && perms.length === 0) setPerms(catalog.presets.SATIN_ALMACI);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const canSave = email.includes("@") && perms.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await invite.mutateAsync({ email: email.trim(), permissions: perms });
      toast.success("Davet e-postası gönderildi — 7 gün geçerli");
      setEmail("");
      setPerms(catalog?.presets.SATIN_ALMACI ?? []);
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  return (
    <Dialog open={open} onClose={() => !invite.isPending && onClose()} size="2xl">
      <DialogTitle>Üye Davet Et</DialogTitle>
      <DialogDescription>
        Davetli, e-postasındaki linkten adını ve parolasını kendisi belirleyerek
        ekibe katılır. Davet 7 gün geçerlidir.
      </DialogDescription>
      <DialogBody className="-mr-3 max-h-[70vh] space-y-4 overflow-y-auto pr-3">
        <Field>
          <Label>E-posta</Label>
          <Input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kisi@firma.com"
          />
        </Field>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-zinc-900">Yetkiler</p>
            {seatsFull ? (
              <p className="text-xs text-amber-700">
                Kullanıcı hakkı dolu — işlem tikleri için paketi yükseltin.
              </p>
            ) : null}
          </div>
          <div className="mt-2">
            {catalog ? (
              <PermissionTable
                catalog={catalog}
                value={perms}
                onChange={setPerms}
                viewerIsOwner={!!viewer?.isOwner}
                seatsFull={seatsFull}
              />
            ) : (
              <p className="text-sm text-zinc-500">Yetki kataloğu yükleniyor…</p>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={invite.isPending}>
          Vazgeç
        </Button>
        <Button onClick={handleSave} disabled={!canSave || invite.isPending}>
          {invite.isPending ? "Gönderiliyor…" : "Davet Gönder"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
