import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { recordCall } from "@/server/metrics";

type FieldErrors = Record<string, string[] | undefined>;

function getFieldErrors(cause: unknown): FieldErrors | null {
  return cause instanceof ZodError ? z.flattenError(cause).fieldErrors : null;
}

// Internal error details never reach the client; Zod field errors do, so the form can show them per field.
const t = initTRPC.create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message: error.code === "INTERNAL_SERVER_ERROR" ? "Internal server error" : shape.message,
      data: {
        ...shape.data,
        fieldErrors: getFieldErrors(error.cause),
      },
    };
  },
});

// Every procedure goes through this middleware; metrics-reporter.ts prints the periodic summary.
const withMetrics = t.middleware(async ({ path, next }) => {
  const start = performance.now();
  const result = await next();
  recordCall(path, performance.now() - start, result.ok);
  return result;
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure.use(withMetrics);
