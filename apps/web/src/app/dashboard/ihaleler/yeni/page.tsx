import { PermissionGuard } from "@/components/auth/permission-guard";
import { VerificationGate } from "@/components/onboarding/verification-gate";
import { Suspense } from "react";
import { YeniIhaleRouter } from "./_components/yeni-router";

export const metadata = {
  title: "Yeni İhale — Rothern",
};

export default function YeniIhalePage() {
  return (
    <PermissionGuard permission="tender:create">
      <Suspense fallback={null}>
        <VerificationGate>
          <YeniIhaleRouter />
        </VerificationGate>
      </Suspense>
    </PermissionGuard>
  );
}
