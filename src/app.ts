import express from 'express';
const app = express();

import api from './api/api.routes';
import * as appMiddlewares from './app.middlewares';

app.use('/api', api);

app.use(appMiddlewares.notFoundHandler);
app.use(appMiddlewares.errorHandler);

export default app;
