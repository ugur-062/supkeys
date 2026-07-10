"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useSetCompanyTier,
  type AdminCompanyDetail,
} from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Üyelik — mevcut tier + bitiş + ver/al. Ek-süreli uzatma ve üyelik geçmişi
 * Faz 3'te bu sekmeye eklenecek.
 */
export function MembershipTab({
  companyId,
  data,
}: {
  companyId: string;
  data: AdminCompanyDetail;
}) {
  const tierAct = useSetCompanyTier();
  const [prompt, setPrompt] = useState(false);
  const daysLeft = data.membershipEndAt
    ? Math.ceil(
        (new Date(data.membershipEndAt).getTime() - Date.now()) / 86_400_000,
      )
    : null;

  return (
    <div className="space-y-4">
      <section className="admin-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-admin-text text-sm font-semibold">
              Mevcut Üyelik
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <Badge color={data.tier === "PAKET" ? "amber" : "zinc"}>
                {data.tier === "PAKET" ? "Premium (PAKET)" : "Standart"}
              </Badge>
              {data.tier === "PAKET" && data.membershipEndAt ? (
                <span className="text-admin-text-muted text-sm">
                  Bitiş: {safeFormat(data.membershipEndAt, "d MMMM yyyy")}
                  {daysLeft != null ? (
                    <span
                      className={
                        daysLeft <= 30 ? "ml-1 font-semibold text-red-600" : "ml-1"
                      }
                    >
                      ({daysLeft} gün)
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.tier === "PAKET" ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={tierAct.isPending}
                  onClick={() => setPrompt(true)}
                >
                  Yeniden Ver / Süre Belirle
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={tierAct.isPending}
                  onClick={() =>
                    tierAct.mutate(
                      { id: companyId, tier: "STANDARD" },
                      {
                        onSuccess: () => toast.success("Standart'a alındı"),
                        onError: (e: unknown) =>
                          toast.error(e instanceof Error ? e.message : "Hata"),
                      },
                    )
                  }
                >
                  Premium'u Kaldır
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={tierAct.isPending}
                onClick={() => setPrompt(true)}
              >
                PAKET Ver
              </Button>
            )}
          </div>
        </div>
      </section>

      <p className="text-admin-text-muted text-xs">
        Ek-süreli uzatma (mevcut bitişe ay ekleme) ve üyelik geçmişi Faz 3 ile
        bu sekmeye gelecek. Şimdilik &quot;Yeniden Ver&quot; bitişi bugünden
        itibaren yeniden hesaplar.
      </p>

      <PromptDialog
        open={prompt}
        title="Premium (PAKET) Ver"
        label="Kaç ay premium verilsin?"
        type="number"
        min={1}
        defaultValue="12"
        required
        confirmLabel="PAKET Ver"
        onConfirm={(v) => {
          const n = Math.floor(Number(v));
          tierAct.mutate(
            { id: companyId, tier: "PAKET", months: n >= 1 ? n : 12 },
            {
              onSuccess: () => toast.success("PAKET verildi"),
              onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Hata"),
            },
          );
          setPrompt(false);
        }}
        onClose={() => setPrompt(false)}
      />
    </div>
  );
}
