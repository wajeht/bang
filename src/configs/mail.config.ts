import env from './env';

export default {
	host: env.EMAIL_HOST,
	port: env.EMAIL_PORT,
	auth: {
		user: env.EMAIL_AUTH_EMAIL,
		pass: env.EMAIL_AUTH_PASS,
	},
};
