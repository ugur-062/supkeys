"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supplierApi } from "@/lib/supplier-auth/api";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import {
  normalizeShortCode,
  validateShortCode,
} from "@supkeys/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
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
    const data = err.response?.data as { message?: string | string[] } | undefined;
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

  // Modal her açıldığında state'i sıfırla — yeni initialToken için input
  // input önceki kalıntılar barındırmasın
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
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                Yeni Davet Kodu Ekle
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                Bir alıcı firmadan davet aldıysanız, kodu girerek bağlantı
                talebinde bulunabilirsiniz.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-4">
            {hasToken ? (
              <div className="rounded-lg bg-success-50 border border-success-200 p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-success-700">Davet bulundu</p>
                  <p className="text-xs text-success-700/80 mt-1 leading-relaxed">
                    Aşağıdaki butona basarak bağlantıyı tamamlayabilirsiniz.
                    Bağlantı kurulduğunda alıcı firma haberdar edilecek.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-brand-50 border border-brand-100 p-3 text-sm text-brand-800">
                  E-postanıza gelen davet kodunu yapıştırın. Format:{" "}
                  <code className="font-mono">XXXX-XXXX</code>
                </div>
                <Field>
                  <Label htmlFor="short-code" required>
                    Davet Kodu
                  </Label>
                  <Input
                    id="short-code"
                    value={shortCode}
                    onChange={(e) => {
                      setShortCode(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="K7X9-3M2P"
                    className="font-mono uppercase tracking-[0.2em] text-center text-lg py-3"
                    maxLength={9}
                    autoComplete="off"
                    autoFocus
                  />
                  {shortCode && !codeIsValid && (
                    <p className="text-xs text-slate-500 mt-1">
                      Beklenen format: 4 karakter — 4 karakter (örn: K7X9-3M2P)
                    </p>
                  )}
                </Field>
              </>
            )}

            {error && (
              <div className="rounded-lg bg-danger-50 border border-danger-200 p-3 text-sm text-danger-700 flex gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1"
              disabled={acceptMutation.isPending}
            >
              İptal
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              loading={acceptMutation.isPending}
              disabled={
                acceptMutation.isPending ||
                (!hasToken && !codeIsValid)
              }
              className="flex-1"
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Bağlanıyor…
                </>
              ) : (
                "Bağlantıyı Tamamla"
              )}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
