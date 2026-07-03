"use client";

import {
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { usePendingApprovalCount } from "@/hooks/use-company-approvals";
import { useUnreadMessages } from "@/hooks/use-company-messages";
import { useMyListings } from "@/hooks/use-company-listings";
import { useOrders } from "@/hooks/use-company-orders";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Clock3,
  MessageSquare,
  PackageCheck,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";

type Tone = "amber" | "blue" | "emerald" | "red" | "violet";

const TONE: Record<Tone, { icon: string; ring: string }> = {
  amber: { icon: "bg-amber-100 text-amber-700", ring: "hover:border-amber-300" },
  blue: { icon: "bg-blue-100 text-blue-700", ring: "hover:border-blue-300" },
  emerald: {
    icon: "bg-emerald-100 text-emerald-700",
    ring: "hover:border-emerald-300",
  },
  red: { icon: "bg-red-100 text-red-700", ring: "hover:border-red-300" },
  violet: {
    icon: "bg-violet-100 text-violet-700",
    ring: "hover:border-violet-300",
  },
};

interface ActionItem {
  key: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone: Tone;
  count: number;
  label: string;
  href: string;
}

/**
 * "Bugün ne yapmalıyım?" şeridi — kullanıcıyı bekleyen işleri tıklanır
 * kartlar olarak gösterir; bekleyen iş yoksa hiç görünmez. Veriler zaten
 * panelde fetch edilen sorgulardan gelir (ek yük ~yok).
 */
export function ActionStrip({
  portal,
  extra = [],
}: {
  portal: "satinalma" | "satis";
  extra?: { key: string; label: string; href: string; count?: number }[];
}) {
  const isBuyer = portal === "satinalma";
  const canAct = useHasCompanyPermission("approval:act");
  const { data: pendingApprovals = 0 } = usePendingApprovalCount(canAct);
  const { data: unreadData } = useUnreadMessages();
  const { data: orders } = useOrders();
  const { data: listings } = useMyListings();

  const role = isBuyer ? "buyer" : "seller";
  const myOrders = (orders ?? []).filter((o) => o.role === role);
  const pendingOrders = myOrders.filter((o) => o.status === "PENDING").length;
  const inDelivery = myOrders.filter((o) => o.status === "IN_DELIVERY").length;
  const awaitingPayment = myOrders.filter(
    (o) => o.status === "DELIVERED",
  ).length;

  // Kapanışa 24 saatten az kalan, hâlâ açık kendi ilanlarım.
  const closingSoon = (listings ?? []).filter((l) => {
    if (l.status !== "OPEN" || !l.closesAt) return false;
    if ((l.type === "ALIM") !== isBuyer) return false;
    const left = new Date(l.closesAt).getTime() - Date.now();
    return left > 0 && left < 24 * 60 * 60 * 1000;
  }).length;

  const base = isBuyer ? "/company/satinalma" : "/company/satis";
  const items: ActionItem[] = [];

  if (pendingApprovals > 0) {
    items.push({
      key: "approvals",
      icon: ShieldCheck,
      tone: "amber",
      count: pendingApprovals,
      label: "onayını bekleyen istek",
      href: "/company/onaylar",
    });
  }
  if (closingSoon > 0) {
    items.push({
      key: "closing",
      icon: Clock3,
      tone: isBuyer ? "blue" : "emerald",
      count: closingSoon,
      label: "ihalede kapanışa 24 saatten az kaldı",
      href: isBuyer ? `${base}/ihalelerim` : `${base}/ilanlarim`,
    });
  }
  if (!isBuyer && pendingOrders > 0) {
    items.push({
      key: "order-pending",
      icon: PackageCheck,
      tone: "emerald",
      count: pendingOrders,
      label: "sipariş onayını bekliyor",
      href: `${base}/siparisler`,
    });
  }
  if (isBuyer && inDelivery > 0) {
    items.push({
      key: "order-receive",
      icon: Truck,
      tone: "blue",
      count: inDelivery,
      label: "sipariş teslim almanı bekliyor",
      href: `${base}/siparisler`,
    });
  }
  if (awaitingPayment > 0) {
    items.push({
      key: "order-payment",
      icon: Wallet,
      tone: "red",
      count: awaitingPayment,
      label: isBuyer
        ? "siparişin ödemesi bekleniyor"
        : "satışın ödemesi bekleniyor",
      href: `${base}/siparisler`,
    });
  }
  const unreadMsgs = unreadData?.count ?? 0;
  if (unreadMsgs > 0) {
    items.push({
      key: "messages",
      icon: MessageSquare,
      tone: "violet",
      count: unreadMsgs,
      label: "okunmamış mesaj",
      href: `${base}/mesajlar`,
    });
  }
  for (const e of extra) {
    if (e.count === 0) continue;
    items.push({
      key: e.key,
      icon: ChevronRight,
      tone: isBuyer ? "blue" : "emerald",
      count: e.count ?? 0,
      label: e.label,
      href: e.href,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => {
        const tone = TONE[it.tone];
        const Icon = it.icon;
        return (
          <Link
            key={it.key}
            href={it.href}
            className={cn(
              "group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 transition-all hover:shadow-sm",
              tone.ring,
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                tone.icon,
              )}
            >
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-sm text-zinc-700">
              {it.count > 0 ? (
                <strong className="font-bold text-zinc-900">{it.count}</strong>
              ) : null}{" "}
              {it.label}
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
              aria-hidden
            />
          </Link>
        );
      })}
    </div>
  );
}
