import { TRPCClientError } from "@trpc/client";
import { useTranslations } from "next-intl";
import type { AppRouter } from "@/server/root";

function getErrorCode(error: unknown) {
  return error instanceof TRPCClientError ? (error as TRPCClientError<AppRouter>).data?.code : undefined;
}

// The backend answers with error codes; translating them here keeps all user-facing text in the frontend.
export function useErrorMessage() {
  const t = useTranslations("errors");

  return (error: unknown) => {
    switch (getErrorCode(error)) {
      case "NOT_FOUND":
        return t("NOT_FOUND");
      case "BAD_REQUEST":
        return t("BAD_REQUEST");
      default:
        return t("generic");
    }
  };
}
