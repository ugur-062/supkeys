import { PermissionGuard } from "@/components/auth/permission-guard";
import { Suspense } from "react";
import { TedarikcilerView } from "./_components/tedarikciler-view";

export const metadata = {
  title: "Tedarikçiler — Rothern",
};

export default function TedarikcilerPage() {
  return (
    <PermissionGuard permission="settings:suppliers">
      <Suspense fallback={null}>
        <TedarikcilerView />
      </Suspense>
    </PermissionGuard>
  );
}
