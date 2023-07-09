import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(path.join(process.cwd(), '.env')) });

const schema = z.object({
  VUE_PORT: z.string().transform(Number),
  SERVER_PORT: z.string().transform(Number),
  NODE_ENV: z.enum(['production', 'development', 'testing']),
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
