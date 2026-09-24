"use client";

import { useTranslations } from "next-intl";
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
import { accentForPortal } from "@/components/ui/button-accent";
import { marketCompaniesPath } from "@/lib/company/panel-market";
import { useCityLabel } from "@/i18n/domain";
import type { PortalKey } from "@/lib/company/portals";
import {
  BadgeCheck,
  Ban,
  Building2,
  Check,
  Clock,
  Copy,
  Flag,
  Inbox,
  MailPlus,
  MessageSquare,
  MoreVertical,
  Search,
  Unlink,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
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
  const t = useTranslations("web.panel.company.connectionsView");
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
      toast.success(action === "accept" ? t("baglantiKuruldu") : t("istekReddedildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("islemBasarisiz")));
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

  const VIEWS: { key: View; label: string; count: number; attention?: boolean; icon: typeof Users }[] = [
    { key: "mine", label: t("baglantilarim"), count: connCount, icon: Users },
    { key: "incoming", label: t("gelenIstekler"), count: incomingRows.length, attention: true, icon: Inbox },
    { key: "pending", label: t("bekleyenler"), count: pendingCount, icon: Clock },
  ];
  /* PORTAL RENGİ (2026-09-18, kullanıcı: "hangi paneldeyse o renge uyumlu"):
     başlık ikonu, seçili görünüm çipi ve "Bağlı" pili portal tonunda —
     satınalma mavi, satış emerald. Düğmeler ButtonAccent'tan zaten boyanır. */
  const accent = accentForPortal(portal);
  const tone =
    accent === "emerald"
      ? { icon: "bg-emerald-50 text-emerald-700", chipOn: "border-emerald-200 bg-emerald-50 text-emerald-800", countOn: "bg-emerald-600 text-white" }
      : { icon: "bg-blue-50 text-blue-700", chipOn: "border-blue-200 bg-blue-50 text-blue-800", countOn: "bg-blue-600 text-white" };

  return (
    <div className="space-y-6">
      {/* BAŞLIK + EYLEMLER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span aria-hidden className={cn("mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-xl", tone.icon)}>
            <Users className="size-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
          <Heading>{t("baglantilar")}</Heading>
          <Text className="mt-1 max-w-2xl text-sm text-zinc-500">
            {t("birlikteCalistiginizFirmalarBaglantiliFirmal")}
          </Text>
          {/* Rothern ID — tek sessiz satır; başka firmalar sizi bununla bulur. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
            <span>{t("rothernId")}</span>
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 tabular-nums font-semibold text-zinc-900">{rothernId ?? "—"}</span>
            {rothernId ? (
              <button
                type="button"
                onClick={copyId}
                aria-label={t("rothernIdYiKopyala")}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" /> {t("kopyalandi")}
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> {t("kopyala")}
                  </>
                )}
              </button>
            ) : null}
          </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button outline href={marketCompaniesPath(portal)}>
            <Search data-slot="icon" />
            {t("firmaBul")}
          </Button>
          {isPaid && canManageConn ? (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus data-slot="icon" />
              {t("davetEt")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* ARAMA + GÖRÜNÜM ÇİPLERİ + TABLO — tek liste, panelin diğer
          listeleriyle aynı kalıp (durum süzgeci çipleri). */}
      <section aria-labelledby="baglantilar-liste" className="space-y-3">
        <h2 id="baglantilar-liste" className="sr-only">{t("baglantiListesi")}</h2>
        <InputGroup>
          <MagnifyingGlassIcon />
          <Input
            aria-label={t("baglantilarimdaAra")}
            value={connQ}
            onChange={(e) => {
              setConnQ(e.target.value);
              setShown(PAGE);
              if (view !== "mine") setView("mine");
            }}
            placeholder={t("firmaAdiRothernIdSektor")}
          />
        </InputGroup>
        <div role="group" aria-label={t("gorunum")} className="flex flex-wrap gap-2">
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
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition",
                  on ? tone.chipOn : "border-zinc-950/10 bg-white text-zinc-700 hover:border-zinc-950/30",
                )}
              >
                <v.icon aria-hidden className="size-4" strokeWidth={1.75} />
                {v.label}
                <span
                  className={cn(
                    "min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
                    on
                      ? tone.countOn
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
              title={t("henuzBaglantinizYok")}
              desc={t("anasayfadanFirmaBulupBaglantiIstegi")}
              action={
                <Button outline href={marketCompaniesPath(portal)}>
                  {t("firmaBul")}
                </Button>
              }
            />
          ) : view === "mine" ? (
            <EmptyBox title={t("eslesenBaglantiYok")} desc={t("ileEslesenBaglantinizBulunamadi", { connQ: connQ })} />
          ) : view === "incoming" ? (
            <EmptyBox title={t("bekleyenIstekYok")} desc={t("sizeGonderilenBaglantiIstekleriBurada")} />
          ) : (
            <EmptyBox title={t("bekleyenIsteginizYok")} desc={t("gonderdiginizIstekVeDavetlerYanitlanana")} />
          )
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white px-2 [--gutter:--spacing(4)]">
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader className={TH}>{t("firma")}</TableHeader>
                    <TableHeader className={cn(TH, "hidden md:table-cell")}>{t("sektorSehir")}</TableHeader>
                    <TableHeader className={cn(TH, "hidden sm:table-cell")}>{t("durum")}</TableHeader>
                    <TableHeader className={cn(TH, "text-right")}>{t("islemler")}</TableHeader>
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
                  {t("gosteriliyor", { min: Math.min(shown, rows.length), length: rows.length })}
                </span>
                <Button outline onClick={() => setShown((n) => n + PAGE)}>
                  {t("dahaFazlaGoster")}
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
/** Tablo başlığı — küçük büyük harf, sessiz (mockup 2026-09-18). */
const TH = "text-xs font-semibold uppercase tracking-wide text-zinc-500";
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
  const t = useTranslations("web.panel.company.connectionsView");
  const cityLabel = useCityLabel();
  const meta = [c.industry, cityLabel(c.city)].filter(Boolean).join(" · ");
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
              title={t("kimligiDogrulanmisFirma")}
            >
              <BadgeCheck aria-hidden className="mr-0.5 size-3" />
              {t("dogrulanmis")}
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
  const t = useTranslations("web.panel.company.connectionsView");
  const disconnect = useDisconnect();
  const block = useBlockCompany();
  const complaint = useFileComplaint();
  const cancelReferral = useCancelReferralInvite();
  const confirmDialog = useConfirm();
  const [complaintOpen, setComplaintOpen] = useState(false);
  const cityLabel = useCityLabel();

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
              <div className="truncate text-xs text-zinc-500">{t("kaydoluncaOtomatikBaglanir")}</div>
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden text-sm text-zinc-500 md:table-cell">—</TableCell>
        <TableCell className="hidden sm:table-cell">
          <Badge color="zinc">{t("ePostaDaveti")}</Badge>
        </TableCell>
        <TableCell className="text-right">
          {canManage ? (
            <Button
              plain
              disabled={cancelReferral.isPending && cancelReferral.variables === row.id}
              onClick={async () => {
                try {
                  await cancelReferral.mutateAsync(row.id);
                  toast.success(t("davetIptalEdildi"));
                } catch (err) {
                  toast.error(extractErrorMessage(err, t("iptalEdilemedi")));
                }
              }}
            >
              {t("iptalEt")}
            </Button>
          ) : null}
        </TableCell>
      </TableRow>
    );
  }

  const c = row.company;
  const meta = [c.industry, cityLabel(c.city)].filter(Boolean).join(" · ");

  const handleDisconnect = async () => {
    const ok = await confirmDialog({
      title: t("baglantiKaldirilsinMi"),
      description: t("ileBaglantinizKaldirilacak", { name: c.name }),
      confirmLabel: t("kaldir"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await disconnect.mutateAsync(row.id);
      toast.success(t("baglantiKaldirildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("baglantiKaldirilamadi")));
    }
  };

  const handleBlock = async () => {
    if (!c.rothernId) return;
    const ok = await confirmDialog({
      title: t("firmaEngellensinMi"),
      description: t("siziGoremezVeSizinleIslem", { name: c.name }),
      confirmLabel: t("engelle"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await block.mutateAsync({ rothernId: c.rothernId });
      toast.success(t("firmaEngellendi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("engellenemedi")));
    }
  };

  const submitComplaint = async (reason: string) => {
    if (!c.rothernId || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({ rothernId: c.rothernId, reason: reason.trim() });
      toast.success(t("sikayetGonderildi"));
      setComplaintOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("sikayetGonderilemedi")));
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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15 ring-inset">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-600" />
            {t("bagli")}
          </span>
        ) : row.kind === "incoming" ? (
          <Badge color="amber">{t("istekGeldi")}</Badge>
        ) : (
          <Badge color="zinc">{t("istekGonderildi")}</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {row.kind === "incoming" ? (
            canManage ? (
              <>
                <Button onClick={() => onRespond(row.id, "accept")} disabled={respondBusy}>
                  {t("kabulEt")}
                </Button>
                <Button plain onClick={() => onRespond(row.id, "reject")} disabled={respondBusy}>
                  {t("reddet")}
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
                    toast.success(t("istekGeriCekildi"));
                  } catch (err) {
                    toast.error(extractErrorMessage(err, t("geriCekilemedi")));
                  }
                }}
              >
                {t("geriCek")}
              </Button>
            ) : null
          ) : (
            <>
              <Button outline href={`/company/mesajlar?with=${c.id}&portal=${portal}`}>
                <MessageSquare data-slot="icon" />
                {t("mesaj")}
              </Button>
              {canManage ? (
                <Dropdown>
                  <DropdownButton plain aria-label={t("dahaFazla")}>
                    <MoreVertical className="size-5" />
                  </DropdownButton>
                  <DropdownMenu anchor="bottom end">
                    <DropdownItem onClick={handleDisconnect} disabled={disconnect.isPending}>
                      <Unlink data-slot="icon" />
                      {t("baglantiyiKaldir")}
                    </DropdownItem>
                    <DropdownItem onClick={handleBlock} disabled={block.isPending}>
                      <Ban data-slot="icon" />
                      {t("engelle")}
                    </DropdownItem>
                    <DropdownItem onClick={() => setComplaintOpen(true)} disabled={complaint.isPending}>
                      <Flag data-slot="icon" />
                      {t("sikayetEt")}
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              ) : null}
            </>
          )}
        </div>
        {/* Diyalog yalnız açıkken kurulur: 50 satırda 50 gizli diyalog
            kurmak listeyi gereksiz ağırlaştırıyordu. */}
        {complaintOpen ? (
          <ReasonDialog
            open
            onClose={() => setComplaintOpen(false)}
            onSubmit={submitComplaint}
            title={t("sikayetEt2")}
            description={t("hakkindakiSikayetinizPlatformYonetimineIleti", { name: c.name })}
            confirmLabel={t("sikayetiGonder")}
            minLength={3}
            destructive
            pending={complaint.isPending}
          />
        ) : null}
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
  const t = useTranslations("web.panel.company.connectionsView");
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
            ? t("zatenKayitliBaglantiIstegiGonderildi", { targetName: res.targetName ?? "" })
            : t("adresineDavetEPostasiGonderildi", { email: res.email ?? parsed.valid[0] ?? "" }),
        );
        close();
        return;
      }
      const res = await batch.mutateAsync(parsed.valid);
      setResult(res);
      const sent = res.summary.request + res.summary.invited;
      toast.success(
        res.summary.skipped
          ? t("davetGonderildiAtlandi", { n: sent, skipped: res.summary.skipped })
          : t("davetGonderildi", { n: sent }),
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, t("davetGonderilemedi")));
    }
  };

  const close = () => {
    setRaw("");
    setResult(null);
    onClose();
  };

  const STATUS_PILL: Record<"request" | "invited" | "skipped", { label: string; cls: string }> = {
    request: { label: t("istekGonderildi"), cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    invited: { label: t("davetEPostasiGitti"), cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    skipped: { label: t("atlandi"), cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  };

  return (
    <Dialog open={open} onClose={() => !pending && close()} size="lg">
      <DialogTitle>{t("davetEt")}</DialogTitle>
      <DialogDescription>
        {t("firmaninEPostasiniYazinKayitliysa")}
      </DialogDescription>
      <DialogBody className="space-y-3">
        {!result ? (
          <>
            <Textarea
              rows={4}
              autoFocus
              aria-label={t("davetEdilecekEPostaAdresleri")}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t("ornekFirmaCom")}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {parsed.valid.length > 1 ? (
                <span className={overLimit ? "font-semibold text-red-600" : "text-zinc-500"}>
                  {t("adres", { n: parsed.valid.length, max: 50 })}
                </span>
              ) : null}
              {parsed.invalid.length > 0 ? (
                <span className="text-amber-700">
                  {t("gecersizAdresYokSayilacak", { length: parsed.invalid.length })}
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
          {result ? t("kapat") : t("vazgec")}
        </Button>
        {!result ? (
          <Button onClick={submit} disabled={pending || parsed.valid.length === 0 || overLimit}>
            {pending
              ? t("gonderiliyor")
              : parsed.valid.length > 1
                ? t("adreseDavetGonder", { length: parsed.valid.length })
                : t("davetGonder")}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
