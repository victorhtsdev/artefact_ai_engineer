"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TRPCClientErrorLike } from "@trpc/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { useErrorMessage } from "@/hooks/use-error-message";
import { TASK_STATUSES, taskFormSchema, type Task, type TaskFormValues } from "@/schemas/task";
import type { AppRouter } from "@/server/root";
import { useTRPC } from "@/trpc/client";

const inputClassName =
  "rounded-md border border-gray-300 px-3 py-2 focus:border-gray-900 focus:outline-none aria-invalid:border-red-500";

export function TaskForm({ task }: { task?: Task }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations();
  const getErrorMessage = useErrorMessage();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      titulo: task?.titulo ?? "",
      descricao: task?.descricao ?? "",
      status: task?.status ?? "pending",
    },
  });

  const mutationCallbacks = (successMessage: string) => ({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.task.pathKey() });
      toast.success(successMessage);
      router.push("/");
    },
    onError: (error: TRPCClientErrorLike<AppRouter>) => {
      const fieldErrors = error.data?.fieldErrors ?? {};
      for (const [field, messages] of Object.entries(fieldErrors)) {
        setError(field as keyof TaskFormValues, { message: messages?.[0] });
      }
      toast.error(getErrorMessage(error));
    },
  });

  const createTask = useMutation(trpc.task.create.mutationOptions(mutationCallbacks(t("form.created"))));
  const updateTask = useMutation(trpc.task.update.mutationOptions(mutationCallbacks(t("form.updated"))));
  const isSaving = createTask.isPending || updateTask.isPending;

  const onSubmit = ({ titulo, descricao, status }: TaskFormValues) => {
    if (task) {
      updateTask.mutate({ id: task.id, titulo, descricao, status });
    } else {
      createTask.mutate({ titulo, descricao });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <FormField id="titulo" label={t("form.titulo")} error={errors.titulo?.message}>
        <input
          id="titulo"
          autoFocus
          aria-invalid={!!errors.titulo}
          aria-describedby={errors.titulo ? "titulo-error" : undefined}
          className={inputClassName}
          {...register("titulo")}
        />
      </FormField>

      <FormField id="descricao" label={t("form.descricao")} error={errors.descricao?.message}>
        <textarea
          id="descricao"
          rows={4}
          aria-invalid={!!errors.descricao}
          aria-describedby={errors.descricao ? "descricao-error" : undefined}
          className={inputClassName}
          {...register("descricao")}
        />
      </FormField>

      {task && (
        <FormField id="status" label={t("form.status")} error={errors.status?.message}>
          <select id="status" className={inputClassName} {...register("status")}>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`taskStatus.${status}`)}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <div className="flex items-center justify-end gap-4">
        <Link href="/" className="text-sm text-gray-700 hover:underline">
          {t("form.cancel")}
        </Link>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isSaving ? t("form.saving") : task ? t("form.save") : t("form.create")}
        </button>
      </div>
    </form>
  );
}
