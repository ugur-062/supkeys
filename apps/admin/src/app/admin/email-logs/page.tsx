import { Suspense } from "react";
import { EmailLogsView } from "./_components/email-logs-view";

export const metadata = {
  title: "E-posta Logları — Supkeys Admin",
  robots: { index: false, follow: false },
};

export default function EmailLogsPage() {
  return (
    <Suspense fallback={null}>
      <EmailLogsView />
    </Suspense>
  );
}
