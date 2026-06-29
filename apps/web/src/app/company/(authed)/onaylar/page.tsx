"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  usePendingApprovals,
  useDecideApproval,
  type PendingApproval,
} from "@/hooks/use-company-approvals";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const TYPE_LABEL: Record<PendingApproval["type"], string> = {
  LISTING_PUBLISH: "İlan Yayını",
  LISTING_AWARD: "Kazandırma",
};

export default function OnaylarPage() {
  const { data: pending, isLoading } = usePendingApprovals();
  const decide = useDecideApproval();

  const handleDecide = async (
    p: PendingApproval,
    action: "approve" | "reject",
  ) => {
    let note: string | undefined;
    if (action === "reject") {
      const r = window.prompt("Ret gerekçesi (opsiyonel):") ?? "";
      note = r.trim() || undefined;
    } else if (!confirm("Bu istek onaylansın mı?")) {
      return;
    }
    try {
      await decide.mutateAsync({ id: p.id, action, note });
      toast.success(action === "approve" ? "Onaylandı" : "Reddedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Heading>Onaylar</Heading>
        <Text className="mt-1 text-sm text-zinc-500">
          Onayını bekleyen ilan yayını ve kazandırma istekleri.
        </Text>
      </div>

      {isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !pending || pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 text-sm font-medium text-zinc-700">
            Bekleyen onay yok
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Sana yönlendirilen onay istekleri burada görünür.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-zinc-950/10 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge
                      color={p.type === "LISTING_AWARD" ? "blue" : "amber"}
                    >
                      {TYPE_LABEL[p.type]}
                    </Badge>
                    <span className="font-mono text-[11px] text-zinc-400">
                      {p.listing.number ?? "—"}
                    </span>
                  </div>
                  <Link
                    href={`/company/ilan/${p.listing.id}`}
                    className="mt-1 block truncate font-medium text-zinc-950 hover:text-blue-600 hover:underline"
                  >
                    {p.listing.title}
                  </Link>
                  <div className="mt-1 text-xs text-zinc-500">
                    Tahmini tutar:{" "}
                    <strong>
                      {p.amount.toLocaleString("tr-TR")} {p.currency}
                    </strong>
                    <span className="mx-1.5 text-zinc-300">·</span>
                    Adım {p.currentStepOrder}/{p.totalSteps}
                    <span className="mx-1.5 text-zinc-300">·</span>
                    {format(new Date(p.createdAt), "d MMM yyyy HH:mm", {
                      locale: tr,
                    })}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    plain
                    onClick={() => handleDecide(p, "reject")}
                    disabled={decide.isPending}
                    title="Reddet"
                  >
                    <XCircle className="h-4 w-4 text-red-500" />
                    Reddet
                  </Button>
                  <Button
                    onClick={() => handleDecide(p, "approve")}
                    disabled={decide.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Onayla
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
