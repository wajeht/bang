import * as minio from 'minio';

import env from './env';

const client = new minio.Client({
	endPoint: env.MINIO_ENDPOINT,
	port: env.MINIO_PORT,
	useSSL: false,
	accessKey: env.MINIO_ACCESS_KEY,
	secretKey: env.MINIO_SECRET_KEY,
});

export default client;
