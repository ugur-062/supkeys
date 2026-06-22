import { Suspense } from "react";
import { CompanyVerificationsView } from "./_components/company-verifications-view";

export default function CompanyVerificationsPage() {
  return (
    <Suspense fallback={null}>
      <CompanyVerificationsView />
    </Suspense>
  );
}
