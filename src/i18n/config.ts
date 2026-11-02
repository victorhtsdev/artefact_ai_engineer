export const locales = ["en", "pt"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const TIME_ZONE = "America/Sao_Paulo";

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
