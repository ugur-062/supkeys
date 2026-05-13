import { PermissionGuard } from "@/components/auth/permission-guard";
import { Suspense } from "react";
import { YeniIhaleRouter } from "./_components/yeni-router";

export const metadata = {
  title: "Yeni İhale — Supkeys",
};

export default function YeniIhalePage() {
  return (
    <PermissionGuard permission="tender:create">
      <Suspense fallback={null}>
        <YeniIhaleRouter />
      </Suspense>
    </PermissionGuard>
  );
}
