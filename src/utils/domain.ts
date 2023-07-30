import env from '../configs/env';

function domain(): string {
	if (env.NODE_ENV === 'development') {
		return `http://localhost:${env.VUE_PORT}`;
	}

	return `https://${env.DOMAIN}`;
}

export default domain();
