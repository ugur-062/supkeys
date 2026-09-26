"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Text } from "@/components/catalyst/text";
import { useRoundHistory } from "@/hooks/use-company-listings";

export function RoundHistoryDialog({
  id,
  open,
  onClose,
  currency,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  currency?: string;
}) {
  const t = useTranslations("web.panel.requests.roundHistoryDialog");
  const history = useRoundHistory(id, open);
  const rounds = history.data ?? [];
  const sym = !currency || currency === "TRY" ? "₺" : currency;

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>{t("turGecmisi")}</DialogTitle>
      <DialogBody className="space-y-5">
        {history.isLoading ? (
          <Text className="text-sm text-zinc-500">{t("yukleniyor")}</Text>
        ) : history.isError ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Text className="text-sm text-red-600">
              {t("turGecmisiYuklenemedi")}
            </Text>
            <Button outline onClick={() => history.refetch()}>
              {t("tekrarDene")}
            </Button>
          </div>
        ) : rounds.length === 0 ? (
          <Text className="text-sm text-zinc-500">
            {t("henuzTamamlanmisTurYokYeni")}
          </Text>
        ) : (
          rounds.map((r) => (
            <div key={r.round} className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                {t("tur", { round: r.round })}
              </div>
              <div className="rounded-xl border border-zinc-950/5 px-2 [--gutter:--spacing(4)]">
                <Table dense>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t("tedarikci")}</TableHeader>
                      <TableHeader className="text-right">{t("teklif")}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {r.bids.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-zinc-900">
                          {b.bidderName}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            i === 0
                              ? "font-semibold text-emerald-700"
                              : "text-zinc-700"
                          }`}
                        >
                          {Number(b.amount).toLocaleString("tr-TR")} {sym}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </DialogBody>
      <DialogActions>
        <Button onClick={onClose}>{t("kapat")}</Button>
      </DialogActions>
    </Dialog>
  );
}
