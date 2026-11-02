import { getLocale, getTranslations } from "next-intl/server";
import { locales } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

export async function LocaleSwitcher() {
  const [currentLocale, t] = await Promise.all([getLocale(), getTranslations("localeSwitcher")]);

  return (
    <form action={setLocale} aria-label={t("label")} className="flex items-center gap-1 text-xs">
      {locales.map((locale, index) => (
        <span key={locale} className="flex items-center gap-1">
          {index > 0 && <span className="text-gray-300">|</span>}
          <button
            type="submit"
            name="locale"
            value={locale}
            aria-pressed={locale === currentLocale}
            className="uppercase text-gray-400 transition-colors hover:text-gray-700 aria-pressed:font-semibold aria-pressed:text-gray-900"
          >
            {locale}
          </button>
        </span>
      ))}
    </form>
  );
}
