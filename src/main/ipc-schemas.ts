import { z } from 'zod';

export const logErrorSchema = z.object({ message: z.string().max(4000) }).strict();
