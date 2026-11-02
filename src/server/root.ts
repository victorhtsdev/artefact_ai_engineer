import { taskRouter } from "@/server/routers/task";
import { router } from "@/server/trpc";

export const appRouter = router({
  task: taskRouter,
});

export type AppRouter = typeof appRouter;
