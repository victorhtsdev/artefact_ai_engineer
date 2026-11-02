import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <main className="mx-auto max-w-2xl p-6 text-center">
      <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
      <p className="mb-6 text-gray-600">{t("description")}</p>
      <Link href="/" className="text-sm text-gray-700 underline">
        {t("backToList")}
      </Link>
    </main>
  );
}
