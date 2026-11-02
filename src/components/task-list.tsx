"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TaskItem } from "@/components/task-item";
import { useErrorMessage } from "@/hooks/use-error-message";
import { GENERATE_BATCH_SIZE, type Task } from "@/schemas/task";
import { useTRPC } from "@/trpc/client";
import { type ListMode, TASK_LIST_INPUT, taskListOptions } from "@/trpc/task-list-options";

const ESTIMATED_ITEM_HEIGHT = 100;
const ITEM_GAP = 12;
const OVERSCAN_ITEMS = 5;
const LOAD_AHEAD_ITEMS = 20;
const SSR_VIEWPORT = { width: 0, height: 1200 };

export function TaskList({ mode }: { mode: ListMode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("tasks");
  const getErrorMessage = useErrorMessage();

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

  const tasks = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

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

  const listRef = useRef<HTMLUListElement>(null);
  const [listOffset, setListOffset] = useState(0);

  useLayoutEffect(() => {
    setListOffset(listRef.current?.offsetTop ?? 0);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: tasks.length,
    getItemKey: (index) => tasks[index].id,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    gap: ITEM_GAP,
    overscan: OVERSCAN_ITEMS,
    scrollMargin: listOffset,
    initialRect: SSR_VIEWPORT,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastRenderedIndex = virtualItems.at(-1)?.index ?? -1;
  const isNearEnd = lastRenderedIndex >= tasks.length - 1 - LOAD_AHEAD_ITEMS;
  const canGenerate = mode === "generate" && !isGenerating && !isGenerateError;

  useEffect(() => {
    if (isPending || !isNearEnd || isFetchingNextPage || isFetchNextPageError) return;

    if (hasNextPage) {
      fetchNextPage();
    } else if (canGenerate) {
      generateTasks({ count: GENERATE_BATCH_SIZE });
    }
  }, [isPending, isNearEnd, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, canGenerate, generateTasks]);

  if (isPending) return <p role="status" className="text-gray-500">{t("loading")}</p>;
  if (isLoadingError) return <p role="alert" className="text-red-600">{getErrorMessage(error)}</p>;
  if (tasks.length === 0 && mode === "default") return <p className="text-gray-500">{t("empty")}</p>;

  return (
    <>
      <ul ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((item) => (
          <li
            key={tasks[item.index].id}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${item.start - listOffset}px)` }}
          >
            <TaskItem task={tasks[item.index]} />
          </li>
        ))}
      </ul>

      <div className="py-6 text-center text-sm text-gray-500">
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
