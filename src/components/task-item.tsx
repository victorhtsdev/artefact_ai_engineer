"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useErrorMessage } from "@/hooks/use-error-message";
import type { Task } from "@/schemas/task";
import { useTRPC } from "@/trpc/client";

export function TaskItem({ task }: { task: Task }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const format = useFormatter();
  const getErrorMessage = useErrorMessage();

  const deleteTask = useMutation(
    trpc.task.delete.mutationOptions({
      onSuccess: () => toast.success(t("tasks.deleted")),
      onError: (error) => toast.error(getErrorMessage(error)),
      onSettled: () => queryClient.invalidateQueries(trpc.task.list.pathFilter()),
    }),
  );

  const formatDate = (date: Date) => format.dateTime(date, { dateStyle: "short", timeStyle: "short" });

  const handleDelete = () => {
    if (window.confirm(t("tasks.confirmDelete", { titulo: task.titulo }))) {
      deleteTask.mutate({ id: task.id });
    }
  };

  return (
    <article className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{task.titulo}</h2>
          {task.descricao && <p className="mt-1 text-sm break-words text-gray-600">{task.descricao}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
              {t(`taskStatus.${task.status}`)}
            </span>
            <span>{t("tasks.createdAt", { date: formatDate(task.dataCriacao) })}</span>
            {task.dataAtualizacao && (
              <span>· {t("tasks.updatedAt", { date: formatDate(task.dataAtualizacao) })}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-sm">
          <Link href={`/tasks/${task.id}/edit`} className="text-gray-700 hover:underline">
            {t("tasks.edit")}
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteTask.isPending}
            className="text-red-600 hover:underline disabled:opacity-50"
          >
            {deleteTask.isPending ? t("tasks.deleting") : t("tasks.delete")}
          </button>
        </div>
      </div>
    </article>
  );
}
