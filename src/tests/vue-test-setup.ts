import '@testing-library/jest-dom';

export const setup = () => {
	process.env.TZ = 'UTC';
};

process.env.VUE_PORT = '3000';
process.env.SERVER_PORT = '8000';
process.env.DB_URL = 'postgresql://username:password@localhost:5432/bang';
process.env.NODE_ENV = 'testing';
process.env.EMAIL_HOST = 'smtp.example.com';
process.env.EMAIL_PORT = '587';
process.env.EMAIL_AUTH_EMAIL = 'example@example.com';
process.env.EMAIL_AUTH_PASS = 'your_email_password';
process.env.PASSWORD_SALT = 'your_password_salt';
process.env.DOMAIN = 'example.com';
process.env.JWT_SECRET = 'your_jwt_secret';
process.env.JWT_EXPIRES_IN = '1d';
process.env.COOKIE_SECRET = 'your_cookie_secret';
process.env.COOKIE_EXPIRES_IN = '30d';
