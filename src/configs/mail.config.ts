import env from './env';

export default {
	host: env.EMAIL.HOST,
	port: env.EMAIL.PORT,
	auth: {
		user: env.EMAIL.AUTH_EMAIL,
		pass: env.EMAIL.AUTH_PASS,
	},
};
