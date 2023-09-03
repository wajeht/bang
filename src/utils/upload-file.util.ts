import minio from '../configs/minio.config';
import env from '../configs/env';

const DEFAULT_BUCKET_NAME = env.MINIO_PUBLIC_BUCKET;

export default async function uploadFile(filePath: string, fileName: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const metaData = {
			'Content-Type': 'application/octet-stream',
		};

		minio.fPutObject(DEFAULT_BUCKET_NAME, fileName, filePath, metaData, async (err) => {
			if (err) {
				reject(err);
			} else {
				let url = await minio.presignedGetObject(DEFAULT_BUCKET_NAME, fileName);

				if (env.NODE_ENV === 'development' || env.NODE_ENV === 'testing') {
					url = url.replace(`minio`, 'localhost');
				}

				resolve(url.split('?')[0]);
			}
		});
	});
}
