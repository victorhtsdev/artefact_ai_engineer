import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TaskList } from "@/components/task-list";
import { getQueryClient, HydrateClient, trpc } from "@/trpc/server";
import { parseListMode, TASK_LIST_INPUT, taskListOptions } from "@/trpc/task-list-options";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode: modeParam } = await searchParams;
  const mode = parseListMode(modeParam);
  const t = await getTranslations();

  // The first page is fetched on the server, so the list is already in the HTML (SSR).
  // HydrateClient hands this cache to React Query in the browser, which continues from there.
  await getQueryClient().prefetchInfiniteQuery(
    trpc.task.list.infiniteQueryOptions(TASK_LIST_INPUT, taskListOptions),
  );

  return (
    <HydrateClient>
      <main className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
          <Link
            href="/tasks/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            {t("tasks.new")}
          </Link>
        </div>

        <div className="mb-4 flex items-center justify-between gap-4 text-sm text-gray-500">
          <p>{mode === "generate" ? t("tasks.generateModeHint") : null}</p>
          <Link href={mode === "generate" ? "/" : "/?mode=generate"} className="shrink-0 hover:underline">
            {mode === "generate" ? t("tasks.exitGenerateMode") : t("tasks.enterGenerateMode")}
          </Link>
        </div>

        <TaskList mode={mode} />
      </main>
    </HydrateClient>
  );
}
