import type { Task, TaskOrderBy, TaskSortCriterion, TaskSortField } from "@/schemas/task";

export type TaskKey = Pick<Task, "id" | "titulo" | "dataCriacao" | "dataAtualizacao">;

const titleCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

const sortValue: Record<TaskSortField, (key: TaskKey) => number | string | undefined> = {
  dataAtualizacao: (key) => key.dataAtualizacao?.getTime(),
  dataCriacao: (key) => key.dataCriacao.getTime(),
  titulo: (key) => key.titulo,
};

function compareValues(a: number | string, b: number | string): number {
  return typeof a === "string" && typeof b === "string" ? titleCollator.compare(a, b) : Number(a) - Number(b);
}

function compareByCriterion(a: TaskKey, b: TaskKey, { field, direction, nulls = "last" }: TaskSortCriterion): number {
  const left = sortValue[field](a);
  const right = sortValue[field](b);

  if (left === undefined || right === undefined) {
    if (left === right) return 0;
    return (left === undefined) === (nulls === "first") ? -1 : 1;
  }
  return (direction === "asc" ? 1 : -1) * compareValues(left, right);
}

export function compareTaskKeys(a: TaskKey, b: TaskKey, orderBy: TaskOrderBy): number {
  for (const criterion of orderBy) {
    const result = compareByCriterion(a, b, criterion);
    if (result !== 0) return result;
  }
  return a.id.localeCompare(b.id);
}
