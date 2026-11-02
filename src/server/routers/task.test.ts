import { beforeEach, describe, expect, it, vi } from "vitest";

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

async function loadApp() {
  vi.resetModules();
  delete (globalThis as { taskStore?: unknown }).taskStore;

  const { appRouter } = await import("@/server/root");
  const { createCallerFactory } = await import("@/server/trpc");
  const route = await import("@/app/api/trpc/[trpc]/route");
  return { api: createCallerFactory(appRouter)({}), route };
}

let app: Awaited<ReturnType<typeof loadApp>>;
let api: typeof app.api;

beforeEach(async () => {
  app = await loadApp();
  api = app.api;
});

async function errorOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (caught: { code: string; cause?: { issues?: { message: string }[] } }) => caught,
  );
  if (!error) throw new Error("Expected the call to fail");
  return { code: error.code, messages: error.cause?.issues?.map((issue) => issue.message) ?? [] };
}

describe("task.create", () => {
  it("creates a pending task with a trimmed title and dataAtualizacao equal to dataCriacao", async () => {
    const task = await api.task.create({ titulo: "  Comprar pão  ", descricao: "" });

    expect(task).toMatchObject({ titulo: "Comprar pão", descricao: undefined, status: "pending" });
    expect(task.dataCriacao).toBeInstanceOf(Date);
    expect(task.dataAtualizacao).toEqual(task.dataCriacao);
  });

  it("puts the new task at the top of the list, above generated ones", async () => {
    await api.task.generateBatch({ count: 15 });
    const created = await api.task.create({ titulo: "Minha tarefa" });

    const { items } = await api.task.list({ limit: 10 });

    expect(items[0].id).toBe(created.id);
  });

  it("rejects an empty or too long title", async () => {
    expect(await errorOf(api.task.create({ titulo: "   " }))).toEqual({
      code: "BAD_REQUEST",
      messages: ["titleRequired"],
    });
    expect(await errorOf(api.task.create({ titulo: "x".repeat(101) }))).toEqual({
      code: "BAD_REQUEST",
      messages: ["titleTooLong"],
    });
  });

  it("rejects a description longer than 500 characters", async () => {
    const { messages } = await errorOf(api.task.create({ titulo: "Task", descricao: "x".repeat(501) }));
    expect(messages).toEqual(["descriptionTooLong"]);
  });
});

describe("task.byId", () => {
  it("returns the task", async () => {
    const created = await api.task.create({ titulo: "Task" });
    expect(await api.task.byId({ id: created.id })).toEqual(created);
  });

  it("fails with NOT_FOUND for a missing task and BAD_REQUEST for an invalid id", async () => {
    expect((await errorOf(api.task.byId({ id: MISSING_ID }))).code).toBe("NOT_FOUND");
    expect(await errorOf(api.task.byId({ id: "abc" }))).toEqual({ code: "BAD_REQUEST", messages: ["invalidId"] });
  });
});

describe("task.update", () => {
  it("updates the fields, sets dataAtualizacao and keeps dataCriacao", async () => {
    const created = await api.task.create({ titulo: "Task" });
    const updated = await api.task.update({
      id: created.id,
      titulo: "Task edited",
      descricao: "Now with a description",
      status: "completed",
    });

    expect(updated).toMatchObject({ titulo: "Task edited", descricao: "Now with a description", status: "completed" });
    expect(updated.dataCriacao).toEqual(created.dataCriacao);
    expect(updated.dataAtualizacao).toBeInstanceOf(Date);
  });

  it("moves the edited task to the top of the list", async () => {
    const [, second] = await api.task.generateBatch({ count: 3 });
    await api.task.update({ id: second.id, titulo: second.titulo, status: "in_progress" });

    const { items } = await api.task.list({ limit: 10 });

    expect(items[0].id).toBe(second.id);
  });

  it("fails with NOT_FOUND for a missing task", async () => {
    const result = await errorOf(api.task.update({ id: MISSING_ID, titulo: "Task", status: "pending" }));
    expect(result.code).toBe("NOT_FOUND");
  });
});

describe("task.delete", () => {
  it("removes the task and fails with NOT_FOUND on a second delete", async () => {
    const created = await api.task.create({ titulo: "Task" });

    expect(await api.task.delete({ id: created.id })).toEqual({ id: created.id });
    expect((await errorOf(api.task.byId({ id: created.id }))).code).toBe("NOT_FOUND");
    expect((await errorOf(api.task.delete({ id: created.id }))).code).toBe("NOT_FOUND");
  });
});

describe("task.list", () => {
  it("pages through every task with the cursor, without repeating or skipping any", async () => {
    const created = await api.task.generateBatch({ count: 25 });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const page = await api.task.list({ limit: 10, cursor });
      seen.push(...page.items.map((task) => task.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual(created.map((task) => task.id));
  });

  it("returns an empty page for an unknown cursor", async () => {
    await api.task.generateBatch({ count: 3 });
    expect(await api.task.list({ limit: 10, cursor: MISSING_ID })).toEqual({ items: [], nextCursor: null });
  });

  it("rejects a limit outside 1–50 and an empty orderBy", async () => {
    expect((await errorOf(api.task.list({ limit: 0 }))).code).toBe("BAD_REQUEST");
    expect((await errorOf(api.task.list({ limit: 51 }))).code).toBe("BAD_REQUEST");
    expect((await errorOf(api.task.list({ limit: 10, orderBy: [] }))).code).toBe("BAD_REQUEST");
  });
});

describe("task.generateBatch", () => {
  it("creates the requested number of tasks, numbered in creation order", async () => {
    await api.task.create({ titulo: "Existing" });
    const created = await api.task.generateBatch({ count: 3 });

    expect(created.map((task) => task.titulo)).toEqual(["Tarefa gerada 2", "Tarefa gerada 3", "Tarefa gerada 4"]);
    expect(created.every((task) => task.dataAtualizacao === undefined)).toBe(true);
  });

  it("rejects more than 50 tasks per batch", async () => {
    expect((await errorOf(api.task.generateBatch({ count: 51 }))).code).toBe("BAD_REQUEST");
  });
});

describe("HTTP error responses", () => {
  const request = (path: string, init?: RequestInit) => new Request(`http://localhost/api/trpc/${path}`, init);

  it("returns 400 with the error per field, as the form expects", async () => {
    const response = await app.route.POST(
      request("task.create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { titulo: "" } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.json.data).toMatchObject({ code: "BAD_REQUEST", fieldErrors: { titulo: ["titleRequired"] } });
  });

  it("returns 404 with the NOT_FOUND code for a missing task", async () => {
    const input = encodeURIComponent(JSON.stringify({ json: { id: MISSING_ID } }));
    const response = await app.route.GET(request(`task.byId?input=${input}`));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.json.data.code).toBe("NOT_FOUND");
  });
});
