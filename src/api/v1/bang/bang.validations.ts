import z from 'zod';

export const getUrlInfoSchema = z.object({
    url: z.string().url(),
});

export type getUrlInfoSchemaType = z.infer<typeof getUrlInfoSchema>;
