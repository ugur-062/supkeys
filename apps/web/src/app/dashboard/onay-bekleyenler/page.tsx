import { PermissionGuard } from "@/components/auth/permission-guard";
import { Suspense } from "react";
import { OnayBekleyenlerView } from "./_components/onay-bekleyenler-view";

export const metadata = {
  title: "Onay Süreçleri — Rothern",
};

export default function OnayBekleyenlerPage() {
  return (
    <PermissionGuard permission="approval:view">
      <Suspense fallback={null}>
        <OnayBekleyenlerView />
      </Suspense>
    </PermissionGuard>
  );
}
