"use client";

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { EmptyState, ListSkeleton, Pagination } from "@/components/list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { usePagedList } from "@/lib/use-paged-list";
import {
  useApprovalFlows,
  useChangeApprovalFlowStatus,
  useDeleteApprovalFlow,
  useDuplicateApprovalFlow,
} from "@/hooks/use-approval-flows";
import {
  APPROVAL_FLOW_STATUS_META,
  APPROVAL_FLOW_TYPE_META,
} from "@/lib/approval-flows/labels";
import type { ApprovalFlow } from "@/lib/approval-flows/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Copy,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  Trash2,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "../../_components/back-to-settings";

export function OnayAkislariListView() {
  // V2-6.5 RBAC — settings:approval permission'a göre erişim
  const { has } = usePermissions();
  const isAdmin = has("settings:approval");

  const [search, setSearch] = useState("");
  const flowsQuery = useApprovalFlows();

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <BackToSettings />
        <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 p-6 flex gap-3 items-start">
          <Shield className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-warning-900">
              Sadece Firma Yöneticileri için
            </p>
            <p className="text-sm text-warning-800 mt-1">
              Onay akışı yönetimi yalnızca <strong>Yönetici</strong>{" "}
              rolündeki kullanıcılar tarafından yapılabilir.
            </p>
            <Link
              href="/dashboard/ayarlar"
              className="inline-block text-sm text-brand-600 hover:underline mt-3"
            >
              Ayarlara dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const flows = flowsQuery.data ?? [];
  const filtered = flows.filter((f) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      f.name.toLowerCase().includes(term) ||
      f.flowNumber.toString().includes(term)
    );
  });
  const paged = usePagedList(filtered, 10);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4 mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Workflow className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-brand-900">
              Onay Akışları
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Onay akışları ile süreçlerinizin tamamlanması için belirleyeceğiniz
              onay adımlarının gerçekleşmesini zorunlu kılabilirsiniz.
            </p>
          </div>
        </div>
        <Link href="/dashboard/ayarlar/onay-akislari/yeni">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Yeni Onay Akışı
          </Button>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Akış no veya adı ile ara…"
              className="pl-9"
            />
          </div>
        </div>

        {flowsQuery.isLoading ? (
          <ListSkeleton rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Workflow}
            variant={search ? "no-results" : "no-data"}
            title={search ? "Eşleşen akış yok" : "Henüz onay akışı yok"}
            description={
              search
                ? "Aramanızı değiştirin ya da yeni bir akış oluşturun."
                : "İlk onay akışınızı oluşturarak süreçlerinizi otomatikleştirin."
            }
            action={
              !search ? (
                <Link href="/dashboard/ayarlar/onay-akislari/yeni">
                  <Button variant="secondary" size="sm">
                    <Plus className="h-4 w-4" />
                    İlk Akışı Oluştur
                  </Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="px-2 [--gutter:--spacing(5)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-20">No</TableHeader>
                  <TableHeader>Akış Adı</TableHeader>
                  <TableHeader>Tür</TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader>Adım</TableHeader>
                  <TableHeader>Oluşturan</TableHeader>
                  <TableHeader>Son Güncelleme</TableHeader>
                  <TableHeader className="w-12" />
                </TableRow>
              </TableHead>
              <TableBody>
                {paged.pageItems.map((flow) => (
                  <FlowRow key={flow.id} flow={flow} />
                ))}
              </TableBody>
            </Table>
            {paged.showPagination ? (
              <div className="px-4 pb-2">
                <Pagination
                  variant="bare"
                  page={paged.page}
                  totalPages={paged.totalPages}
                  total={paged.total}
                  pageSize={paged.pageSize}
                  onPageChange={paged.setPage}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowRow({ flow }: { flow: ApprovalFlow }) {
  const router = useRouter();
  const changeStatus = useChangeApprovalFlowStatus();
  const duplicate = useDuplicateApprovalFlow();
  const remove = useDeleteApprovalFlow();

  const typeMeta = APPROVAL_FLOW_TYPE_META[flow.type];
  const statusMeta = APPROVAL_FLOW_STATUS_META[flow.status];

  const onToggleStatus = () => {
    const next = flow.status === "ACTIVE" ? "PASSIVE" : "ACTIVE";
    changeStatus.mutate(
      { id: flow.id, status: next },
      {
        onSuccess: () =>
          toast.success(
            next === "ACTIVE" ? "Akış aktifleştirildi" : "Akış pasif yapıldı",
          ),
        onError: (err) =>
          toast.error(extractErrorMessage(err, "Durum değiştirilemedi")),
      },
    );
  };

  const onDuplicate = () => {
    duplicate.mutate(flow.id, {
      onSuccess: () => toast.success("Akış kopyalandı (Taslak)"),
      onError: (err) =>
        toast.error(extractErrorMessage(err, "Kopyalama başarısız")),
    });
  };

  const onDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `"${flow.name}" akışını silmek istediğinize emin misiniz?`,
      )
    ) {
      return;
    }
    remove.mutate(flow.id, {
      onSuccess: () => toast.success("Akış silindi"),
      onError: (err) =>
        toast.error(extractErrorMessage(err, "Silme başarısız")),
    });
  };

  return (
    <TableRow>
      <TableCell className="align-middle font-mono text-sm text-zinc-600">
        #{flow.flowNumber}
      </TableCell>
      <TableCell className="align-middle">
        <Link
          href={`/dashboard/ayarlar/onay-akislari/${flow.id}`}
          className="font-semibold text-zinc-900 hover:text-zinc-600 hover:underline"
        >
          {flow.name}
        </Link>
        {flow.description ? (
          <p className="text-xs text-zinc-500 line-clamp-1 mt-0.5">
            {flow.description}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="align-middle">
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
            typeMeta.pillClass,
          )}
        >
          {typeMeta.label}
        </span>
      </TableCell>
      <TableCell className="align-middle">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold",
            flow.status === "ACTIVE"
              ? "text-success-700"
              : flow.status === "DRAFT"
                ? "text-warning-700"
                : "text-zinc-600",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dotClass)} />
          {statusMeta.label}
        </span>
      </TableCell>
      <TableCell className="align-middle text-sm text-zinc-600">
        {flow.steps.length}
      </TableCell>
      <TableCell className="align-middle text-sm text-zinc-600">
        {flow.createdBy.firstName} {flow.createdBy.lastName}
      </TableCell>
      <TableCell className="align-middle text-xs text-zinc-500">
        {format(new Date(flow.updatedAt), "d MMM yyyy HH:mm", {
          locale: tr,
        })}
      </TableCell>
      <TableCell className="align-middle text-right">
        <Dropdown>
          <DropdownButton plain aria-label="Aksiyonlar">
            <MoreVertical className="h-4 w-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem
              onClick={() =>
                router.push(`/dashboard/ayarlar/onay-akislari/${flow.id}`)
              }
            >
              <Pencil data-slot="icon" />
              <DropdownLabel>Görüntüle / Düzenle</DropdownLabel>
            </DropdownItem>
            <DropdownItem onClick={onToggleStatus}>
              <Power data-slot="icon" />
              <DropdownLabel>
                {flow.status === "ACTIVE" ? "Pasif Yap" : "Aktif Et"}
              </DropdownLabel>
            </DropdownItem>
            <DropdownItem onClick={onDuplicate}>
              <Copy data-slot="icon" />
              <DropdownLabel>Kopyala</DropdownLabel>
            </DropdownItem>
            <DropdownItem onClick={onDelete}>
              <Trash2 data-slot="icon" />
              <DropdownLabel className="text-danger-700">Sil</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </TableCell>
    </TableRow>
  );
}
