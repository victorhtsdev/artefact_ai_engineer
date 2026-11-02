import { DEFAULT_TASK_ORDER, TASKS_PAGE_SIZE, type TaskPage } from "@/schemas/task";

export type ListMode = "default" | "generate";

export function parseListMode(value: unknown): ListMode {
  return value === "generate" ? "generate" : "default";
}

export const TASK_LIST_INPUT = { limit: TASKS_PAGE_SIZE, orderBy: DEFAULT_TASK_ORDER };

export const taskListOptions = {
  getNextPageParam: (lastPage: TaskPage) => lastPage.nextCursor,
};
