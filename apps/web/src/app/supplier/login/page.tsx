import { Suspense } from "react";
import { SupplierLoginClient } from "./_components/login-page-client";

export default function SupplierLoginPage() {
  return (
    <Suspense fallback={null}>
      <SupplierLoginClient />
    </Suspense>
  );
}
