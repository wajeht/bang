import '@testing-library/jest-dom';

export const setup = () => {
	process.env.TZ = 'UTC';
};

process.env.VUE_PORT = '3000';
process.env.SERVER_PORT = '8000';
process.env.NODE_ENV = 'testing';

process.env.PASSWORD_SALT = 'your_password_salt';
process.env.DOMAIN = 'example.com';
process.env.JWT_SECRET = 'your_jwt_secret';
process.env.JWT_EXPIRES_IN = '1d';
process.env.COOKIE_SECRET = 'your_cookie_secret';
process.env.COOKIE_EXPIRES_IN = '30d';

process.env.DB_PORT = '5432';
process.env.DB_HOST = 'localhost';
process.env.DB_USERNAME = 'username';
process.env.DB_PASSWORD = 'password';
process.env.DB_DATABASE = 'bang';
process.env.DB_URL = 'postgresql://username:password@localhost:5432/bang';

process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ACCESS_KEY = 'your_minio_access_key';
process.env.MINIO_SECRET_KEY = 'your_minio_secret_key';
process.env.MINIO_PUBLIC_BUCKET = 'bang'

process.env.EMAIL_HOST = 'localhost';
process.env.EMAIL_PORT = '1025';
process.env.EMAIL_AUTH_EMAIL = 'example@example.com';
process.env.EMAIL_AUTH_EMAIL_ALIAS = 'example@example.com';
process.env.EMAIL_AUTH_PASS = 'your_email_password';
