import { PrismaClient } from '@prisma/client';
import ENV from '../configs/env';

declare global {
	// eslint-disable-next-line no-var
	var prisma: PrismaClient | undefined;
}

const prisma =
	global.prisma ||
	new PrismaClient({
		log: ENV.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
	});

if (ENV.NODE_ENV !== 'production') {
	global.prisma = prisma;
}

export default prisma;
