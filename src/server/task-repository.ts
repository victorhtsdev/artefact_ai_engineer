import "server-only";
import { randomUUID } from "node:crypto";
import type { CreateTaskInput, ListTasksInput, Task, TaskOrderBy, TaskPage, UpdateTaskInput } from "@/schemas/task";
import { createDemoTasks } from "@/server/demo-data";
import { registerTaskCount } from "@/server/metrics";
import { compareTaskKeys } from "@/server/task-ordering";

type TaskStore = {
  tasks: Map<string, Task>;
  version: number;
};

function createStore(): TaskStore {
  const initialTasks = process.env.SEED_DEMO_DATA === "true" ? createDemoTasks() : [];
  return { tasks: new Map(initialTasks.map((task) => [task.id, task])), version: 0 };
}

// In-memory storage, as the spec asks. Kept on globalThis so it survives hot reload in development.
// The rest of the app only talks to taskRepository, so a database could replace the Map without other changes.
const globalForTasks = globalThis as unknown as { taskStore?: TaskStore };
const store = (globalForTasks.taskStore ??= createStore());

registerTaskCount(() => store.tasks.size);

function save(task: Task): void {
  store.tasks.set(task.id, task);
  store.version++;
}

const normalizeDescricao = (descricao?: string) => descricao || undefined;

// Sorting every task on each read is the expensive part; the sorted list is reused until a write bumps the version.
let sortedTasksCache: { version: number; order: string; tasks: Task[] } | undefined;

function getSortedTasks(orderBy: TaskOrderBy): Task[] {
  const order = JSON.stringify(orderBy);
  if (sortedTasksCache?.version === store.version && sortedTasksCache.order === order) {
    return sortedTasksCache.tasks;
  }

  const tasks = [...store.tasks.values()].sort((a, b) => compareTaskKeys(a, b, orderBy));
  sortedTasksCache = { version: store.version, order, tasks };
  return tasks;
}

// Cursor = id of the last item returned. Unlike page numbers, it doesn't skip or repeat items
// when tasks are created or deleted while the user is scrolling.
function paginate<T extends { id: string }>(
  list: T[],
  { limit, cursor }: Pick<ListTasksInput, "limit" | "cursor">,
): { items: T[]; nextCursor: string | null } {
  const start = cursor ? list.findIndex((item) => item.id === cursor) + 1 : 0;
  if (cursor && start === 0) return { items: [], nextCursor: null };

  const items = list.slice(start, start + limit);
  const hasMore = start + limit < list.length;

  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

function buildTask({ titulo, descricao }: CreateTaskInput, createdAt: Date): Task {
  return {
    id: randomUUID(),
    titulo,
    descricao: normalizeDescricao(descricao),
    status: "pending",
    dataCriacao: createdAt,
  };
}

export const taskRepository = {
  async list({ limit, cursor, orderBy }: ListTasksInput): Promise<TaskPage> {
    return paginate(getSortedTasks(orderBy), { limit, cursor });
  },

  async count(): Promise<number> {
    return store.tasks.size;
  },

  async findById(id: string): Promise<Task | undefined> {
    return store.tasks.get(id);
  },

  // A task created by the user counts as its own latest change, so it lands at the top of the list.
  // Generated tasks (createMany) keep dataAtualizacao empty and go to the end, where infinite scroll appends them.
  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date();
    const task: Task = { ...buildTask(input, now), dataAtualizacao: now };
    save(task);
    return task;
  },

  async createMany(inputs: CreateTaskInput[]): Promise<Task[]> {
    const now = Date.now();
    // +index ms keeps the batch in creation order; equal timestamps would fall back to the random id.
    const created = inputs.map((input, index) => buildTask(input, new Date(now + index)));
    for (const task of created) store.tasks.set(task.id, task);
    store.version++;
    return created;
  },

  async update({ id, titulo, descricao, status }: UpdateTaskInput): Promise<Task | undefined> {
    const existing = store.tasks.get(id);
    if (!existing) return undefined;

    const updated: Task = {
      ...existing,
      titulo,
      descricao: normalizeDescricao(descricao),
      status,
      dataAtualizacao: new Date(),
    };
    save(updated);
    return updated;
  },

  async remove(id: string): Promise<boolean> {
    if (!store.tasks.delete(id)) return false;
    store.version++;
    return true;
  },
};
