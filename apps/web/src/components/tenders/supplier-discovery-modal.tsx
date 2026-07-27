"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useInviteConnection } from "@/hooks/use-company-connections";
import {
  useSupplierDiscovery,
  type DiscoveryCandidate,
} from "@/hooks/use-supplier-discovery";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Building2, Check, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A: platform dizininden ihale
 * kategorileriyle eşleşen, bağlantısız firmalar. Seçilenlere BAĞLANTI daveti
 * gider (kabul eden ihaleye davet edilebilir hâle gelir / PUBLIC ihaleyi görür).
 */
export function SupplierDiscoveryModal({
  isOpen,
  onClose,
  type,
  categoryIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  type: "ALIM" | "SATIS";
  categoryIds: string[];
}) {
  const discovery = useSupplierDiscovery();
  const invite = useInviteConnection();
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCandidates([]);
    setInvited(new Set());
    if (categoryIds.length === 0) return;
    discovery
      .mutateAsync({ type, categoryIds })
      .then(setCandidates)
      .catch(() => toast.error("Öneriler yüklenemedi — tekrar deneyin"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const sendInvite = async (c: DiscoveryCandidate) => {
    if (!c.rothernId || inviting) return;
    setInviting(c.companyId);
    try {
      await invite.mutateAsync(c.rothernId);
      setInvited((s) => new Set(s).add(c.companyId));
      toast.success(`${c.name} firmasına bağlantı daveti gönderildi`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    } finally {
      setInviting(null);
    }
  };

  const counterpart = type === "ALIM" ? "tedarikçi" : "alıcı";

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm transition data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex w-screen items-start justify-center p-2 pt-6 sm:p-4">
        <DialogPanel className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-zinc-950/5 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-zinc-950">
                  Daha fazla {counterpart}ye eriş
                </DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-500">
                  İhale kategorilerinize göre platformda eşleşen, henüz bağlantınız
                  olmayan firmalar. Davet gönderin — kabul edince ihalenize davet
                  edebilirsiniz.
                </p>
              </div>
            </div>
            <IconButton aria-label="Kapat" onClick={onClose}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {categoryIds.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Önce Genel Bilgi adımında ihale kategorisini seçin — öneriler
                kategoriye göre bulunur.
              </p>
            ) : discovery.isPending ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Eşleşen firmalar aranıyor…
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Bu kategorilerde önerilebilecek yeni firma bulunamadı.
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => {
                  const done =
                    invited.has(c.companyId) || c.connectionStatus === "PENDING";
                  return (
                    <li
                      key={c.companyId}
                      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                        <Building2 className="h-4 w-4 text-zinc-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                          <span className="truncate">{c.name}</span>
                          {c.strongMatch ? (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                              Güçlü eşleşme
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                          {c.city ? (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />
                              {c.city}
                            </span>
                          ) : null}
                          {c.matchedCategories.length > 0 ? (
                            <span className="truncate">
                              {c.matchedCategories.join(" · ")}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {done ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                          Davet gönderildi
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={inviting === c.companyId}
                          onClick={() => sendInvite(c)}
                        >
                          {inviting === c.companyId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Bağlantı daveti gönder
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-zinc-950/5 bg-zinc-50/60 px-6 py-3 text-xs text-zinc-500">
            Davet kabul edilince firma bağlantılarınıza eklenir; davetli
            ihalenize buradan davet edebilir, herkese açık ihalenizi zaten
            görebilir hâle gelir.
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
