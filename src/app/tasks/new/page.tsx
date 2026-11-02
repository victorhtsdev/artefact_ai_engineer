import { getTranslations } from "next-intl/server";
import { TaskForm } from "@/components/task-form";

export default async function NewTaskPage() {
  const t = await getTranslations("form");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">{t("createTitle")}</h1>
      <TaskForm />
    </main>
  );
}
