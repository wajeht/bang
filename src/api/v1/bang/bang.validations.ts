import z from 'zod';

export const getUrlInfoSchema = z.object({
	url: z.string().url(),
});

export const getSearchSchema = z.object({
	q: z.string(),
});

export type getUrlInfoSchemaType = z.infer<typeof getUrlInfoSchema>;
export type getSearchSchemaType = z.infer<typeof getSearchSchema>;
