import { z } from "zod";

export const TASK_STATUSES = ["pending", "in_progress", "completed"] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const taskIdSchema = z.object({
  id: z.uuid("invalidId"),
});

export const createTaskSchema = z.object({
  titulo: z.string().trim().min(1, "titleRequired").max(100, "titleTooLong"),
  descricao: z.string().trim().max(500, "descriptionTooLong").optional(),
});

export const taskFormSchema = createTaskSchema.extend({
  status: taskStatusSchema,
});

export const updateTaskSchema = taskFormSchema.extend(taskIdSchema.shape);

export const TASK_SORT_FIELDS = ["dataAtualizacao", "dataCriacao", "titulo"] as const;

export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export const NULLS_POSITIONS = ["first", "last"] as const;

export const taskSortCriterionSchema = z.object({
  field: z.enum(TASK_SORT_FIELDS),
  direction: z.enum(SORT_DIRECTIONS),
  nulls: z.enum(NULLS_POSITIONS).optional(),
});

export const taskOrderBySchema = z.array(taskSortCriterionSchema).min(1).max(TASK_SORT_FIELDS.length);

export const DEFAULT_TASK_ORDER: z.infer<typeof taskOrderBySchema> = [
  { field: "dataAtualizacao", direction: "desc", nulls: "last" },
  { field: "dataCriacao", direction: "asc" },
];

export const TASKS_PAGE_SIZE = 10;

export const listTasksSchema = z.object({
  limit: z.number().int().min(1).max(50).default(TASKS_PAGE_SIZE),
  cursor: z.uuid().nullish(),
  orderBy: taskOrderBySchema.default(DEFAULT_TASK_ORDER),
});

export const GENERATE_BATCH_SIZE = 20;

export const generateTasksSchema = z.object({
  count: z.number().int().min(1).max(50).default(GENERATE_BATCH_SIZE),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskFormValues = z.infer<typeof taskFormSchema>;
export type TaskSortCriterion = z.infer<typeof taskSortCriterionSchema>;
export type TaskOrderBy = z.infer<typeof taskOrderBySchema>;
export type TaskSortField = TaskSortCriterion["field"];
export type ListTasksInput = z.infer<typeof listTasksSchema>;

export type Task = {
  id: string;
  titulo: string;
  descricao?: string;
  status: TaskStatus;
  dataCriacao: Date;
  dataAtualizacao?: Date;
};

export type TaskPage = {
  items: Task[];
  nextCursor: string | null;
};
