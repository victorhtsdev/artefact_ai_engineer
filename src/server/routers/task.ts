import { TRPCError } from "@trpc/server";
import {
  createTaskSchema,
  generateTasksSchema,
  listTasksSchema,
  taskIdSchema,
  updateTaskSchema,
} from "@/schemas/task";
import { createGeneratedTaskInputs } from "@/server/demo-data";
import { taskRepository } from "@/server/task-repository";
import { publicProcedure, router } from "@/server/trpc";

function taskNotFound(id: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `Task ${id} not found` });
}

export const taskRouter = router({
  list: publicProcedure.input(listTasksSchema).query(({ input }) => taskRepository.list(input)),

  byId: publicProcedure
    .input(taskIdSchema)
    .query(async ({ input }) => (await taskRepository.findById(input.id)) ?? taskNotFound(input.id)),

  create: publicProcedure
    .input(createTaskSchema)
    .mutation(({ input }) => taskRepository.create(input)),

  generateBatch: publicProcedure.input(generateTasksSchema).mutation(async ({ input }) => {
    const startNumber = (await taskRepository.count()) + 1;
    return taskRepository.createMany(createGeneratedTaskInputs(input.count, startNumber));
  }),

  update: publicProcedure
    .input(updateTaskSchema)
    .mutation(async ({ input }) => (await taskRepository.update(input)) ?? taskNotFound(input.id)),

  delete: publicProcedure.input(taskIdSchema).mutation(async ({ input }) => {
    if (!(await taskRepository.remove(input.id))) taskNotFound(input.id);
    return { id: input.id };
  }),
});
