import { z } from 'zod';

export const logErrorSchema = z.object({ message: z.string().max(4000) }).strict();

export const startupSchema = z.object({}).strict();
export const sessionUpdateSchema = z
  .object({ title: z.string().max(300), dirty: z.boolean() })
  .strict();
