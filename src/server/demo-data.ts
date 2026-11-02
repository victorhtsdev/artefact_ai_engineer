import "server-only";
import { randomUUID } from "node:crypto";
import { TASK_STATUSES, type CreateTaskInput, type Task } from "@/schemas/task";

const DEMO_TASK_COUNT = 25;
const ONE_HOUR_IN_MS = 60 * 60 * 1000;

export function createDemoTasks(): Task[] {
  const now = Date.now();

  return Array.from({ length: DEMO_TASK_COUNT }, (_, index) => {
    const createdAt = new Date(now - (DEMO_TASK_COUNT - index) * ONE_HOUR_IN_MS);

    return {
      id: randomUUID(),
      title: `Sample task ${index + 1}`,
      description: index % 3 === 0 ? undefined : `Fictional description of task ${index + 1}.`,
      status: TASK_STATUSES[index % TASK_STATUSES.length],
      createdAt,
    };
  });
}

export function createGeneratedTaskInputs(count: number, startNumber: number): CreateTaskInput[] {
  return Array.from({ length: count }, (_, index) => {
    const number = startNumber + index;
    return {
      title: `Generated task ${number}`,
      description: `Created automatically while scrolling (#${number}).`,
    };
  });
}
