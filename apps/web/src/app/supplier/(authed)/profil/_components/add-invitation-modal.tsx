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
import { Text } from "@/components/catalyst/text";
import { Alert } from "@/components/ui/alert";
import { supplierApi } from "@/lib/supplier-auth/api";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface AddInvitationModalProps {
  open: boolean;
  onClose: () => void;
  /** URL'den geldi: invitation token (`?invitation=...`) — varsa modal otomatik açık + direkt kabul */
  initialToken?: string | null;
}

interface AcceptResponse {
  relationId: string;
  tenantId: string;
  tenantName: string;
  status: "ACTIVE";
  message: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function AddInvitationModal({
  open,
  onClose,
  initialToken,
}: AddInvitationModalProps) {
  const queryClient = useQueryClient();
  const hasToken = !!initialToken;
  const [shortCode, setShortCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Modal her açıldığında state'i sıfırla
  useEffect(() => {
    if (open) {
      setShortCode("");
      setError(null);
    }
  }, [open, initialToken]);

  const acceptMutation = useMutation({
    mutationFn: async (input: {
      invitationToken?: string;
      shortCode?: string;
    }) => {
      const { data } = await supplierApi.post<AcceptResponse>(
        "/supplier-self-service/accept-invitation",
        input,
      );
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `${data.tenantName} ile bağlantınız kuruldu! Profilinizde görüntüleyebilirsiniz.`,
      );
      queryClient.invalidateQueries({ queryKey: ["supplier-auth", "me"] });
      onClose();
    },
    onError: (err) => {
      setError(getErrorMessage(err, "Bağlantı kurulamadı"));
    },
  });

  const normalizedCode = useMemo(
    () => normalizeShortCode(shortCode),
    [shortCode],
  );
  const codeIsValid = useMemo(
    () => validateShortCode(normalizedCode),
    [normalizedCode],
  );

  const handleSubmit = () => {
    setError(null);
    if (hasToken) {
      acceptMutation.mutate({ invitationToken: initialToken! });
      return;
    }
    if (!codeIsValid) {
      setError("Geçerli bir davet kodu girin (örn: K7X9-3M2P)");
      return;
    }
    acceptMutation.mutate({ shortCode: normalizedCode });
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Yeni Davet Kodu Ekle</DialogTitle>
      <DialogDescription>
        Bir alıcı firmadan davet aldıysanız, kodu girerek bağlantı talebinde
        bulunabilirsiniz.
      </DialogDescription>
      <DialogBody className="space-y-4">
        {hasToken ? (
          <Alert variant="success" title="Davet bulundu">
            Aşağıdaki butona basarak bağlantıyı tamamlayabilirsiniz. Bağlantı
            kurulduğunda alıcı firma haberdar edilecek.
          </Alert>
        ) : (
          <>
            <Alert variant="info">
              E-postanıza gelen davet kodunu yapıştırın. Format:{" "}
              <code className="font-mono">XXXX-XXXX</code>
            </Alert>
            <Field>
              <Label>Davet Kodu *</Label>
              <Input
                value={shortCode}
                onChange={(e) => {
                  setShortCode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="K7X9-3M2P"
                maxLength={9}
                autoComplete="off"
                autoFocus
              />
              {shortCode && !codeIsValid ? (
                <Text className="mt-1 text-xs">
                  Beklenen format: 4 karakter — 4 karakter (örn: K7X9-3M2P)
                </Text>
              ) : null}
            </Field>
          </>
        )}

        {error ? <Alert variant="danger">{error}</Alert> : null}
      </DialogBody>
      <DialogActions>
        <Button
          plain
          onClick={onClose}
          disabled={acceptMutation.isPending}
        >
          İptal
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={acceptMutation.isPending || (!hasToken && !codeIsValid)}
        >
          {acceptMutation.isPending ? (
            <>
              <Loader2 data-slot="icon" className="animate-spin" />
              Bağlanıyor…
            </>
          ) : (
            "Bağlantıyı Tamamla"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
