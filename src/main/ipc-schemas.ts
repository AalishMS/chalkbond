import { z } from 'zod';

export const logErrorSchema = z.object({ message: z.string().max(4000) }).strict();

export const startupSchema = z.object({}).strict();
export const sessionUpdateSchema = z
  .object({ title: z.string().max(300), dirty: z.boolean() })
  .strict();

const maxDrawingBytes = 20 * 1024 * 1024;
export const clipboardWriteSchema = z
  .object({
    png: z
      .instanceof(Uint8Array)
      .refine(
        (bytes) =>
          bytes.length <= 64 * 1024 * 1024 &&
          [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte),
      ),
    svg: z
      .string()
      .startsWith('<svg')
      .refine((text) => Buffer.byteLength(text, 'utf8') <= maxDrawingBytes),
    drawing: z
      .string()
      .max(maxDrawingBytes)
      .regex(/^\{[\x20-\x7E]*$/)
      .nullable(),
  })
  .strict();
export const clipboardReadSchema = z.object({}).strict();
