import minio from '../configs/minio.config';

const DEFAULT_BUCKET_NAME = 'bang';

export default function uploadFile(filePath: string, fileName: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const metaData = {
            'Content-Type': 'application/octet-stream',
        };

        minio.fPutObject(DEFAULT_BUCKET_NAME, fileName, filePath, metaData, (err) => {
            if (err) {
                reject(err);
            } else {
                const url = minio.presignedGetObject(DEFAULT_BUCKET_NAME, fileName);
                resolve(url);
            }
        });
    });
}
