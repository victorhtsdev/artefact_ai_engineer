import type { Messages } from "next-intl";
import { useTranslations } from "next-intl";

type ValidationKey = keyof Messages["validation"];

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
};

export function FormField({ id, label, error, children }: FormFieldProps) {
  const t = useTranslations("validation");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600">
          {t(error as ValidationKey)}
        </p>
      )}
    </div>
  );
}
