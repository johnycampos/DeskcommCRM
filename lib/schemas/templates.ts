import { z } from "zod";

export const templateMediaInputSchema = z.object({
  id: z.string().uuid().optional(),
  storage_path: z
    .string()
    .trim()
    .min(1)
    .regex(
      /^[0-9a-fA-F-]{36}\/message-template-media\/[0-9a-fA-F-]{36}\.[a-zA-Z0-9]+$/,
      "storage_path inválido para mídia de template (esperado: {orgId}/message-template-media/{uuid}.{ext})",
    ),
  media_mime: z
    .string()
    .trim()
    .min(1)
    .refine((mime) => mime.startsWith("image/") || mime.startsWith("video/"), {
      message: "Apenas imagens ou vídeos são permitidos.",
    }),
  media_size_bytes: z.number().int().nonnegative(),
  filename: z.string().trim().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});
export type TemplateMediaInput = z.infer<typeof templateMediaInputSchema>;

export const createTemplateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4096),
  shortcut: z.string().trim().min(1).max(40).optional(),
  /** true = compartilhado da org (owner null, exige manager+); false = pessoal. */
  shared: z.boolean().default(false),
  media: z.array(templateMediaInputSchema).max(10).optional(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(4096),
    shortcut: z.string().trim().min(1).max(40).nullable(),
    media: z.array(templateMediaInputSchema).max(10).optional(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
