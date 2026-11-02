import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_ORDER, type TaskOrderBy } from "@/schemas/task";
import { compareTaskKeys, type TaskKey } from "@/server/task-ordering";

const at = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour));

const key = (id: string, createdHour: number, updatedHour?: number): TaskKey => ({
  id,
  titulo: `Task ${id}`,
  dataCriacao: at(createdHour),
  dataAtualizacao: updatedHour === undefined ? undefined : at(updatedHour),
});

const sortIds = (keys: TaskKey[], orderBy: TaskOrderBy) =>
  keys.toSorted((a, b) => compareTaskKeys(a, b, orderBy)).map((task) => task.id);

describe("compareTaskKeys", () => {
  const a = key("a", 1, 11);
  const b = key("b", 2);
  const c = key("c", 3, 10);
  const d = key("d", 4);

  it("lists edited tasks first by most recent edit, then never edited tasks by creation", () => {
    expect(sortIds([d, c, b, a], DEFAULT_TASK_ORDER)).toEqual(["a", "c", "b", "d"]);
  });

  it("keeps a newly created task at the end of the default order", () => {
    const created = key("e", 5);
    expect(sortIds([created, a, b, c, d], DEFAULT_TASK_ORDER).at(-1)).toBe("e");
  });

  it("breaks ties in the edit date by creation date", () => {
    const first = key("first", 1, 12);
    const second = key("second", 2, 12);
    expect(sortIds([second, first], DEFAULT_TASK_ORDER)).toEqual(["first", "second"]);
  });

  it("places missing values first when asked to", () => {
    const orderBy: TaskOrderBy = [{ field: "dataAtualizacao", direction: "desc", nulls: "first" }];
    expect(sortIds([a, b, c, d], orderBy)).toEqual(["b", "d", "a", "c"]);
  });

  it("falls back to the id when every criterion ties", () => {
    const orderBy: TaskOrderBy = [{ field: "dataCriacao", direction: "asc" }];
    expect(sortIds([key("z", 1), key("y", 1)], orderBy)).toEqual(["y", "z"]);
  });

  it("orders titles naturally", () => {
    const titled = (id: string, titulo: string): TaskKey => ({ ...key(id, 1), titulo });
    const orderBy: TaskOrderBy = [{ field: "titulo", direction: "asc" }];
    expect(sortIds([titled("10", "Tarefa 10"), titled("2", "Tarefa 2")], orderBy)).toEqual(["2", "10"]);
  });
});
