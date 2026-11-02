"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { TaskItem } from "@/components/task-item";
import { useErrorMessage } from "@/hooks/use-error-message";
import { useInView } from "@/hooks/use-in-view";
import { GENERATE_BATCH_SIZE, type Task } from "@/schemas/task";
import { useTRPC } from "@/trpc/client";
import { type ListMode, TASK_LIST_INPUT, taskListOptions } from "@/trpc/task-list-options";

const PREFETCH_DISTANCE = "0px 0px 150% 0px";

// Baseline for the performance test: renders every task. The app uses TaskList (virtualized);
// this version is only reachable through ?list=plain.
export function TaskListPlain({ mode }: { mode: ListMode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("tasks");
  const getErrorMessage = useErrorMessage();
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: PREFETCH_DISTANCE });

  const {
    data,
    isPending,
    isLoadingError,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useInfiniteQuery(trpc.task.list.infiniteQueryOptions(TASK_LIST_INPUT, taskListOptions));

  const appendGeneratedPage = (created: Task[]) => {
    queryClient.setQueryData(trpc.task.list.infiniteQueryKey(TASK_LIST_INPUT), (current) => {
      if (!current) return current;
      const lastPage = current.pages[current.pages.length - 1];
      const cursor = lastPage.items.at(-1)?.id ?? null;

      return {
        pages: [...current.pages.slice(0, -1), { ...lastPage, nextCursor: cursor }, { items: created, nextCursor: null }],
        pageParams: [...current.pageParams, cursor],
      };
    });
  };

  const {
    mutate: generateTasks,
    isPending: isGenerating,
    isError: isGenerateError,
    reset: resetGenerate,
  } = useMutation(trpc.task.generateBatch.mutationOptions({ onSuccess: appendGeneratedPage }));

  const canGenerate = mode === "generate" && !isGenerating && !isGenerateError;

  useEffect(() => {
    if (!inView || isFetchingNextPage || isFetchNextPageError) return;

    if (hasNextPage) {
      fetchNextPage();
    } else if (canGenerate) {
      generateTasks({ count: GENERATE_BATCH_SIZE });
    }
  }, [inView, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, canGenerate, generateTasks]);

  if (isPending) return <p role="status" className="text-gray-500">{t("loading")}</p>;
  if (isLoadingError) return <p role="alert" className="text-red-600">{getErrorMessage(error)}</p>;

  const tasks = data.pages.flatMap((page) => page.items);
  if (tasks.length === 0 && mode === "default") return <p className="text-gray-500">{t("empty")}</p>;

  return (
    <>
      <ul className="space-y-3">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskItem task={task} />
          </li>
        ))}
      </ul>

      <div ref={loadMoreRef} className="py-6 text-center text-sm text-gray-500">
        {isFetchingNextPage && <p role="status">{t("loadingMore")}</p>}
        {isGenerating && <p role="status">{t("generating")}</p>}
        {isFetchNextPageError && (
          <button type="button" onClick={() => fetchNextPage()} className="text-red-600 hover:underline">
            {t("loadMoreError")}
          </button>
        )}
        {isGenerateError && (
          <button type="button" onClick={resetGenerate} className="text-red-600 hover:underline">
            {t("generateError")}
          </button>
        )}
      </div>
    </>
  );
}
