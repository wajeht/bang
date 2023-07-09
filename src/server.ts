import app from './app';

import ENV from './configs/env';

app.listen(ENV.SERVER_PORT, () => {
	console.log(`Server was started on http://localhost:${ENV.SERVER_PORT}`);
});
