import Redis from 'ioredis';
import { logger } from '../logger';
import RedisMock from 'ioredis-mock';
import { redisConfig } from '../configs';

const redisOptions = {
	port: redisConfig.port,
	host: redisConfig.host,
	password: redisConfig.password,
	maxRetriesPerRequest: null,
	family: 0, // Support both IPv6 and IPv4
};

const createRedisClient = () => {
	if (process.env.APP_ENV === 'testing') {
		return new RedisMock(redisOptions);
	}
	return new Redis(redisOptions);
};

const redis = createRedisClient();

redis.on('ready', () => {
	logger.info('Redis connection established successfully');
});

redis.on('error', (error) => {
	logger.error('Error initializing Redis:', error);
	process.exit(1);
});

export { redis };
