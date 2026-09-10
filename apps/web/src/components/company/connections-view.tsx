"use client";

import { tierAtLeast } from "@rothern/shared";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/catalyst/table";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Textarea } from "@/components/catalyst/textarea";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Heading } from "@/components/catalyst/heading";
import { Input, InputGroup } from "@/components/catalyst/input";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { Text } from "@/components/catalyst/text";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Thumb } from "@/components/ui/thumb";
import {
  useCancelReferralInvite,
  useConnections,
  useConnectionSelf,
  useDisconnect,
  useIncomingInvites,
  useOutgoingInvites,
  useInviteByEmail,
  useInviteByEmailBatch,
  useReferralInvites,
  useBlockCompany,
  useRespondInvite,
  type ConnectionCompany,
} from "@/hooks/use-company-connections";
import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { useFileComplaint } from "@/hooks/use-company-complaints";
import { ListSkeleton } from "@/components/list";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { marketCompaniesPath } from "@/lib/company/panel-market";
import type { PortalKey } from "@/lib/company/portals";
import {
  Ban,
  Building2,
  Check,
  Copy,
  Flag,
  MailPlus,
  MessageSquare,
  MoreVertical,
  Search,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * BAĞLANTILAR — yeniden tasarım (2026-09-10, kullanıcı kararı: "beğenmiyorum,
 * Keşfet'e gerek yok, göze hitap etmiyor").
 *
 * Sayfa YALNIZ ilişki yönetimidir; firma bulma anasayfadaki "Firma" pili ve
 * firma dizinindedir. Bu yüzden:
 *  - Keşfet sekmesi ve sekme çubuğu KALKTI (`?tab=` parametresi de).
 *  - Başlıkta iki eylem: "Firma bul" (o portalın dizini) ve "Davet et"
 *    (tek/toplu e-posta daveti tek diyalogda; Silver+ ∧ connections:manage).
 *  - TEK TABLO (dördüncü tur, kullanıcı kararı: "tablo gibi yap; arama
 *    kutusunun altına Bağlantılarım · Gelen istekler · Bekleyenler"): üstte
 *    arama, altında üç görünüm çipi (sayılı; gelen istek amber), altında
 *    dense tablo — Firma · Sektör/Şehir · Durum · Eylem. Satır türüne göre
 *    eylem: Mesaj+menü / Kabul-Reddet / Geri çek / İptal et. 50'şer çizim.
 *    Ray denemesi (ikinci-üçüncü tur) kaldırıldı.
 * İzinsiz üye (connections:manage yok) her şeyi salt-okunur görür.
 */
export function ConnectionsView({ portal = "satinalma" }: { portal?: PortalKey }) {
  const self = useConnectionSelf();
  const connections = useConnections();
  const incoming = useIncomingInvites();
  const outgoing = useOutgoingInvites();
  const referralInvites = useReferralInvites();
  const respond = useRespondInvite();
  const cancelReferral = useCancelReferralInvite();
  const disconnectOutgoing = useDisconnect();

  // STANDART davet GÖNDEREMEZ (gelen daveti kabul eder) — kilit yalnız
  // "Davet et" düğmesinde; listeler herkese açık.
  const { company } = useCompanyAuth();
  const isPaid = tierAtLeast(company?.tier ?? "STANDART", "SILVER");
  // F7: bağlantı mutasyonları connections:manage ister (Kurucu/Yönetici).
  const canManageConn = useHasCompanyPermission("connections:manage");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [connQ, setConnQ] = useState("");
  const [copied, setCopied] = useState(false);
  // Uzun vade: yüzlerce bağlantıda sayfa tek seferde uzamasın — 50'şer
  // göster (veri zaten inmiş; kesim yalnız çizimde). Arama değişince sıfırlanır.
  const PAGE = 50;
  const [shown, setShown] = useState(PAGE);
  const [view, setView] = useState<View>("mine");

  const rothernId = self.data?.rothernId ?? null;
  const incomingRows = incoming.data ?? [];
  const outgoingRows = outgoing.data ?? [];
  const referralRows = referralInvites.data ?? [];
  const connCount = connections.data?.length ?? 0;
  const pendingCount = outgoingRows.length + referralRows.length;

  // Bağlantılarım içi arama — ad / Rothern ID / sektör / şehir (istemci).
  const filteredConnections = useMemo(() => {
    const rows = connections.data ?? [];
    const needle = connQ.trim().toLocaleLowerCase("tr");
    if (!needle) return rows;
    return rows.filter((c) =>
      [c.company.name, c.company.rothernId ?? "", c.company.industry ?? "", c.company.city ?? ""]
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(needle),
    );
  }, [connections.data, connQ]);

  const copyId = async () => {
    if (!rothernId) return;
    try {
      await navigator.clipboard.writeText(rothernId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sessiz */
    }
  };

  const handleRespond = async (connectionId: string, action: "accept" | "reject") => {
    try {
      await respond.mutateAsync({ connectionId, action });
      toast.success(action === "accept" ? "Bağlantı kuruldu" : "İstek reddedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  // Görünüm çipi (dördüncü tur, kullanıcı kararı: "tablo gibi, arama
  // kutusunun altına Bağlantılarım · Gelen istekler · Bekleyenler").
  const rows: TableRowData[] = useMemo(() => {
    if (view === "incoming") {
      return incomingRows.map((inv) => ({ kind: "incoming" as const, id: inv.connectionId, company: inv.company }));
    }
    if (view === "pending") {
      return [
        ...outgoingRows.map((inv) => ({ kind: "outgoing" as const, id: inv.connectionId, company: inv.company })),
        ...referralRows.map((r) => ({ kind: "referral" as const, id: r.id, email: r.email })),
      ];
    }
    return filteredConnections.map((c) => ({ kind: "mine" as const, id: c.connectionId, company: c.company }));
  }, [view, incomingRows, outgoingRows, referralRows, filteredConnections]);
  const loading =
    view === "incoming" ? incoming.isLoading : view === "pending" ? outgoing.isLoading : connections.isLoading;

  const VIEWS: { key: View; label: string; count: number; attention?: boolean }[] = [
    { key: "mine", label: "Bağlantılarım", count: connCount },
    { key: "incoming", label: "Gelen istekler", count: incomingRows.length, attention: true },
    { key: "pending", label: "Bekleyenler", count: pendingCount },
  ];

  return (
    <div className="space-y-6">
      {/* BAŞLIK + EYLEMLER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Heading>Bağlantılar</Heading>
          <Text className="mt-1 max-w-2xl text-sm text-zinc-500">
            Birlikte çalıştığınız firmalar. Bağlantılı firmalar özel taleplerinizi görür, size
            mesaj atar ve doğrulama şartı olmadan teklif verir.
          </Text>
          {/* Rothern ID — tek sessiz satır; başka firmalar sizi bununla bulur. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
            <span>Rothern ID:</span>
            <span className="tabular-nums font-semibold text-zinc-900">{rothernId ?? "—"}</span>
            {rothernId ? (
              <button
                type="button"
                onClick={copyId}
                aria-label="Rothern ID'yi kopyala"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" /> Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Kopyala
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button outline href={marketCompaniesPath(portal)}>
            <Search data-slot="icon" />
            Firma bul
          </Button>
          {isPaid && canManageConn ? (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus data-slot="icon" />
              Davet et
            </Button>
          ) : null}
        </div>
      </div>

      {/* ARAMA + GÖRÜNÜM ÇİPLERİ + TABLO — tek liste, panelin diğer
          listeleriyle aynı kalıp (durum süzgeci çipleri). */}
      <section aria-labelledby="baglantilar-liste" className="space-y-3">
        <h2 id="baglantilar-liste" className="sr-only">Bağlantı listesi</h2>
        <InputGroup>
          <MagnifyingGlassIcon />
          <Input
            aria-label="Bağlantılarımda ara"
            value={connQ}
            onChange={(e) => {
              setConnQ(e.target.value);
              setShown(PAGE);
              if (view !== "mine") setView("mine");
            }}
            placeholder="Firma adı, Rothern ID, sektör veya şehir"
          />
        </InputGroup>
        <div role="group" aria-label="Görünüm" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => {
            const on = view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setView(v.key);
                  setShown(PAGE);
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  on
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-950/10 bg-white text-zinc-700 hover:border-zinc-950/30",
                )}
              >
                {v.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                    on
                      ? "bg-white/15 text-white"
                      : v.attention && v.count > 0
                        ? "bg-amber-100 text-amber-800"
                        : "bg-zinc-100 text-zinc-600",
                  )}
                >
                  {v.count}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white">
            <ListSkeleton rows={4} />
          </div>
        ) : rows.length === 0 ? (
          view === "mine" && connCount === 0 ? (
            <EmptyBox
              title="Henüz bağlantınız yok"
              desc="Anasayfadan firma bulup bağlantı isteği gönderin ya da e-posta ile davet edin."
              action={
                <Button outline href={marketCompaniesPath(portal)}>
                  Firma bul
                </Button>
              }
            />
          ) : view === "mine" ? (
            <EmptyBox title="Eşleşen bağlantı yok" desc={`"${connQ}" ile eşleşen bağlantınız bulunamadı.`} />
          ) : view === "incoming" ? (
            <EmptyBox title="Bekleyen istek yok" desc="Size gönderilen bağlantı istekleri burada görünür." />
          ) : (
            <EmptyBox title="Bekleyen isteğiniz yok" desc="Gönderdiğiniz istek ve davetler yanıtlanana dek burada durur." />
          )
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white px-2 [--gutter:--spacing(4)]">
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Firma</TableHeader>
                    <TableHeader className="hidden md:table-cell">Sektör · Şehir</TableHeader>
                    <TableHeader className="hidden sm:table-cell">Durum</TableHeader>
                    <TableHeader className="text-right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.slice(0, shown).map((r) => (
                    <ConnectionTableRow
                      key={`${r.kind}-${r.id}`}
                      row={r}
                      portal={portal}
                      canManage={canManageConn}
                      onRespond={handleRespond}
                      respondBusy={respond.isPending && respond.variables?.connectionId === r.id}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > shown ? (
              <div className="flex items-center justify-between gap-3 text-sm text-zinc-500">
                <span>
                  {Math.min(shown, rows.length)} / {rows.length} gösteriliyor
                </span>
                <Button outline onClick={() => setShown((n) => n + PAGE)}>
                  Daha fazla göster
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

type View = "mine" | "incoming" | "pending";
type TableRowData =
  | { kind: "mine"; id: string; company: ConnectionCompany }
  | { kind: "incoming"; id: string; company: ConnectionCompany }
  | { kind: "outgoing"; id: string; company: ConnectionCompany }
  | { kind: "referral"; id: string; email: string };

/** Logo/baş harf + ad + Doğrulanmış + alt satır (sektör · şehir · ID). */
function CompanyLine({
  company: c,
  hint,
  compact = false,
}: {
  company: ConnectionCompany;
  hint?: string;
  /** Ray kartlarında küçük avatar. */
  compact?: boolean;
}) {
  const meta = [c.industry, c.city].filter(Boolean).join(" · ");
  const size = compact ? "sm" : "md";
  const inner = (
    <>
      {c.logoUrl ? (
        <Thumb src={c.logoUrl} size={size} fallbackIcon={Building2} className="bg-white" />
      ) : (
        <AvatarInitials name={c.name} size={size} />
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-zinc-900">{c.name}</span>
          {c.verified ? (
            <span
              className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset"
              title="Kimliği doğrulanmış firma"
            >
              Doğrulanmış
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-zinc-500">
          {hint ?? [meta, c.rothernId].filter(Boolean).join(" · ") ?? ""}
        </div>
      </div>
    </>
  );
  if (!c.rothernId) return <div className="flex min-w-0 items-center gap-3">{inner}</div>;
  return (
    <Link href={`/company/firma/${c.rothernId}`} className="flex min-w-0 items-center gap-3 hover:opacity-90">
      {inner}
    </Link>
  );
}

/**
 * Tablo satırı — dört tür: bağlı (Mesaj + menü), gelen istek (Kabul/Reddet),
 * gönderilen istek (Geri çek), e-posta daveti (İptal et).
 */
function ConnectionTableRow({
  row,
  portal,
  canManage,
  onRespond,
  respondBusy,
}: {
  row: TableRowData;
  portal: PortalKey;
  canManage: boolean;
  onRespond: (connectionId: string, action: "accept" | "reject") => Promise<void>;
  respondBusy: boolean;
}) {
  const disconnect = useDisconnect();
  const block = useBlockCompany();
  const complaint = useFileComplaint();
  const cancelReferral = useCancelReferralInvite();
  const confirmDialog = useConfirm();
  const [complaintOpen, setComplaintOpen] = useState(false);

  if (row.kind === "referral") {
    return (
      <TableRow>
        <TableCell>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
              <MailPlus className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">{row.email}</div>
              <div className="truncate text-xs text-zinc-500">Kaydolunca otomatik bağlanır</div>
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden text-sm text-zinc-500 md:table-cell">—</TableCell>
        <TableCell className="hidden sm:table-cell">
          <Badge color="zinc">E-posta daveti</Badge>
        </TableCell>
        <TableCell className="text-right">
          {canManage ? (
            <Button
              plain
              disabled={cancelReferral.isPending && cancelReferral.variables === row.id}
              onClick={async () => {
                try {
                  await cancelReferral.mutateAsync(row.id);
                  toast.success("Davet iptal edildi");
                } catch (err) {
                  toast.error(extractErrorMessage(err, "İptal edilemedi"));
                }
              }}
            >
              İptal et
            </Button>
          ) : null}
        </TableCell>
      </TableRow>
    );
  }

  const c = row.company;
  const meta = [c.industry, c.city].filter(Boolean).join(" · ");

  const handleDisconnect = async () => {
    const ok = await confirmDialog({
      title: "Bağlantı kaldırılsın mı?",
      description: `"${c.name}" ile bağlantınız kaldırılacak.`,
      confirmLabel: "Kaldır",
      destructive: true,
    });
    if (!ok) return;
    try {
      await disconnect.mutateAsync(row.id);
      toast.success("Bağlantı kaldırıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Bağlantı kaldırılamadı"));
    }
  };

  const handleBlock = async () => {
    if (!c.rothernId) return;
    const ok = await confirmDialog({
      title: "Firma engellensin mi?",
      description: `"${c.name}" sizi göremez ve sizinle işlem yapamaz.`,
      confirmLabel: "Engelle",
      destructive: true,
    });
    if (!ok) return;
    try {
      await block.mutateAsync({ rothernId: c.rothernId });
      toast.success("Firma engellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Engellenemedi"));
    }
  };

  const submitComplaint = async (reason: string) => {
    if (!c.rothernId || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({ rothernId: c.rothernId, reason: reason.trim() });
      toast.success("Şikayet gönderildi");
      setComplaintOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şikayet gönderilemedi"));
    }
  };

  return (
    <TableRow>
      <TableCell>
        <CompanyLine company={c} compact />
      </TableCell>
      <TableCell className="hidden text-sm text-zinc-600 md:table-cell">{meta || "—"}</TableCell>
      <TableCell className="hidden sm:table-cell">
        {row.kind === "mine" ? (
          <Badge color="lime">Bağlı</Badge>
        ) : row.kind === "incoming" ? (
          <Badge color="amber">İstek geldi</Badge>
        ) : (
          <Badge color="zinc">İstek gönderildi</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {row.kind === "incoming" ? (
            canManage ? (
              <>
                <Button onClick={() => onRespond(row.id, "accept")} disabled={respondBusy}>
                  Kabul et
                </Button>
                <Button plain onClick={() => onRespond(row.id, "reject")} disabled={respondBusy}>
                  Reddet
                </Button>
              </>
            ) : null
          ) : row.kind === "outgoing" ? (
            canManage ? (
              <Button
                plain
                disabled={disconnect.isPending && disconnect.variables === row.id}
                onClick={async () => {
                  try {
                    await disconnect.mutateAsync(row.id);
                    toast.success("İstek geri çekildi");
                  } catch (err) {
                    toast.error(extractErrorMessage(err, "Geri çekilemedi"));
                  }
                }}
              >
                Geri çek
              </Button>
            ) : null
          ) : (
            <>
              <Button plain href={`/company/mesajlar?with=${c.id}&portal=${portal}`}>
                <MessageSquare data-slot="icon" />
                Mesaj
              </Button>
              {canManage ? (
                <Dropdown>
                  <DropdownButton plain aria-label="Daha fazla">
                    <MoreVertical className="size-5" />
                  </DropdownButton>
                  <DropdownMenu anchor="bottom end">
                    <DropdownItem onClick={handleDisconnect} disabled={disconnect.isPending}>
                      <Unlink data-slot="icon" />
                      Bağlantıyı kaldır
                    </DropdownItem>
                    <DropdownItem onClick={handleBlock} disabled={block.isPending}>
                      <Ban data-slot="icon" />
                      Engelle
                    </DropdownItem>
                    <DropdownItem onClick={() => setComplaintOpen(true)} disabled={complaint.isPending}>
                      <Flag data-slot="icon" />
                      Şikayet et
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              ) : null}
            </>
          )}
        </div>
        <ReasonDialog
          open={complaintOpen}
          onClose={() => setComplaintOpen(false)}
          onSubmit={submitComplaint}
          title="Şikayet Et"
          description={`"${c.name}" hakkındaki şikayetiniz platform yönetimine iletilir.`}
          confirmLabel="Şikayeti Gönder"
          minLength={3}
          destructive
          pending={complaint.isPending}
        />
      </TableCell>
    </TableRow>
  );
}

function EmptyBox({ title, desc, action }: { title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{desc}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * DAVET ET — tek ve toplu e-posta daveti TEK diyalog (eski "E-posta ile
 * davet" formu + "Toplu Davet" diyaloğu birleşti). Bir adres → tekil uç
 * (kayıtlıysa istek, değilse davet e-postası); birden çok → toplu uç
 * (en fazla 50, adres başına sonuç raporu).
 */
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const single = useInviteByEmail();
  const batch = useInviteByEmailBatch();
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<
    import("@/hooks/use-company-connections").BatchInviteResult | null
  >(null);

  const parsed = useMemo(() => {
    const all = raw
      .split(/[\n,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const e of all) {
      if (seen.has(e)) continue;
      seen.add(e);
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) valid.push(e);
      else invalid.push(e);
    }
    return { valid, invalid };
  }, [raw]);
  const overLimit = parsed.valid.length > 50;
  const pending = single.isPending || batch.isPending;

  const submit = async () => {
    if (parsed.valid.length === 0 || overLimit) return;
    try {
      if (parsed.valid.length === 1) {
        const res = await single.mutateAsync(parsed.valid[0] as string);
        toast.success(
          res.kind === "request"
            ? `"${res.targetName}" zaten kayıtlı — bağlantı isteği gönderildi`
            : `${res.email} adresine davet e-postası gönderildi`,
        );
        close();
        return;
      }
      const res = await batch.mutateAsync(parsed.valid);
      setResult(res);
      toast.success(
        `${res.summary.request + res.summary.invited} davet gönderildi${
          res.summary.skipped ? `, ${res.summary.skipped} atlandı` : ""
        }`,
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  const close = () => {
    setRaw("");
    setResult(null);
    onClose();
  };

  const STATUS_PILL: Record<"request" | "invited" | "skipped", { label: string; cls: string }> = {
    request: { label: "İstek gönderildi", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    invited: { label: "Davet e-postası gitti", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    skipped: { label: "Atlandı", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  };

  return (
    <Dialog open={open} onClose={() => !pending && close()} size="lg">
      <DialogTitle>Davet et</DialogTitle>
      <DialogDescription>
        Firmanın e-postasını yazın. Kayıtlıysa bağlantı isteği gider, değilse davet e-postası;
        kaydolunca kalıcı bağlanırsınız. Birden çok adres için her satıra bir adres (en fazla 50).
      </DialogDescription>
      <DialogBody className="space-y-3">
        {!result ? (
          <>
            <Textarea
              rows={4}
              autoFocus
              aria-label="Davet edilecek e-posta adresleri"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"ornek@firma.com"}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {parsed.valid.length > 1 ? (
                <span className={overLimit ? "font-semibold text-red-600" : "text-zinc-500"}>
                  {parsed.valid.length}/50 adres
                </span>
              ) : null}
              {parsed.invalid.length > 0 ? (
                <span className="text-amber-700">
                  {parsed.invalid.length} geçersiz adres yok sayılacak
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {result.results.map((r) => {
              const pill = STATUS_PILL[r.status];
              return (
                <li
                  key={r.email}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-zinc-800">
                    {r.email}
                    {r.targetName ? <span className="ml-1.5 text-xs text-zinc-500">({r.targetName})</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold ring-1", pill.cls)}>
                      {pill.label}
                    </span>
                    {r.reason ? <span className="text-xs text-zinc-500">{r.reason}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={close} disabled={pending}>
          {result ? "Kapat" : "Vazgeç"}
        </Button>
        {!result ? (
          <Button onClick={submit} disabled={pending || parsed.valid.length === 0 || overLimit}>
            {pending
              ? "Gönderiliyor…"
              : parsed.valid.length > 1
                ? `${parsed.valid.length} adrese davet gönder`
                : "Davet gönder"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
