"use client";

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
}: {
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  const history = useRoundHistory(id, open);
  const rounds = history.data ?? [];

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Tur Geçmişi</DialogTitle>
      <DialogBody className="space-y-5">
        {history.isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : rounds.length === 0 ? (
          <Text className="text-sm text-zinc-500">
            Henüz tamamlanmış tur yok. Yeni tur başlattığında önceki turun
            teklifleri burada arşivlenir.
          </Text>
        ) : (
          rounds.map((r) => (
            <div key={r.round} className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                Tur {r.round}
              </div>
              <div className="rounded-xl border border-zinc-950/5 px-2 [--gutter:--spacing(4)]">
                <Table dense>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Tedarikçi</TableHeader>
                      <TableHeader className="text-right">Teklif</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {r.bids.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-zinc-900">
                          {b.bidderName}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono tabular-nums ${
                            i === 0
                              ? "font-semibold text-emerald-700"
                              : "text-zinc-700"
                          }`}
                        >
                          {Number(b.amount).toLocaleString("tr-TR")} ₺
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
        <Button onClick={onClose}>Kapat</Button>
      </DialogActions>
    </Dialog>
  );
}
