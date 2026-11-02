import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TaskForm } from "@/components/task-form";
import { getQueryClient, trpc } from "@/trpc/server";

async function getTask(id: string) {
  try {
    return await getQueryClient().fetchQuery(trpc.task.byId.queryOptions({ id }));
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")) {
      notFound();
    }
    throw error;
  }
}

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [task, t] = await Promise.all([getTask(id), getTranslations("form")]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">{t("editTitle")}</h1>
      <TaskForm task={task} />
    </main>
  );
}
