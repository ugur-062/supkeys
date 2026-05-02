import { Suspense } from "react";
import { SupplierIhalelerView } from "./_components/ihaleler-view";

export const metadata = {
  title: "İhaleler",
};

export default function SupplierIhalelerPage() {
  return (
    <Suspense fallback={null}>
      <SupplierIhalelerView />
    </Suspense>
  );
}
