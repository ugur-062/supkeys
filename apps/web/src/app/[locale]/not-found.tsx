import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Global 404 — eşleşmeyen rota veya notFound() çağrısı. */
export default function NotFound() {
  const t = useTranslations("web.marketplace.pages");
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <p className="text-5xl font-semibold tracking-tight text-zinc-900" aria-hidden>
          404
        </p>
        <h1 className="text-lg font-semibold text-zinc-900">{t("notFoundTitle")}</h1>
        <p className="text-sm text-zinc-500">{t("notFoundBody")}</p>
        <Link
          href="/"
          className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
