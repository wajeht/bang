import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(path.join(process.cwd(), '.env')) });

const schema = z.object({
	VUE_PORT: z.string().transform(Number),
	SERVER_PORT: z.string().transform(Number),
	DB_URL: z.string(),
	NODE_ENV: z.enum(['production', 'development', 'testing']),
	EMAIL_HOST: z.string(),
	EMAIL_PORT: z.string().transform(Number),
	EMAIL_AUTH_EMAIL: z.string(),
	EMAIL_AUTH_PASS: z.string(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
	console.error(
		'❌ Invalid environment variables:',
		JSON.stringify(parsed.error.format(), null, 4),
	);
	process.exit(1);
}

export default parsed.data;
