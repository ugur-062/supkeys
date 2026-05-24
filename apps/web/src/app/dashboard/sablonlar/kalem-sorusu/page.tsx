import { PermissionGuard } from "@/components/auth/permission-guard";
import { QuestionTemplatesView } from "./_components/question-templates-view";

export const metadata = {
  title: "Kalem Sorusu Şablonları — Supkeys",
};

export default function QuestionTemplatesPage() {
  return (
    <PermissionGuard permission="templates:view">
      <QuestionTemplatesView />
    </PermissionGuard>
  );
}
